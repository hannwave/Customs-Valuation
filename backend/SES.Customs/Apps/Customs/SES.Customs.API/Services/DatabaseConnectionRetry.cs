using System.Net.Sockets;
using Npgsql;

namespace SES.Customs.API.Services;

/// <summary>Retries read requests that fail while a database connection is being established.</summary>
public static class DatabaseConnectionRetry
{
    private const int ReadRetryCount = 3;

    public static async Task<T> ExecuteReadAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { return await operation(); }
            catch (Exception exception) when (attempt < ReadRetryCount && IsTransientConnectionFailure(exception))
            {
                await Task.Delay(TimeSpan.FromMilliseconds(250 * (1 << attempt)), cancellationToken);
            }
        }
    }

    /// <summary>
    /// Only retries DNS resolution failures for writes. A DNS failure happens before PostgreSQL
    /// accepts a connection, so the write cannot have committed and can safely be attempted again.
    /// </summary>
    public static async Task<T> ExecuteWriteAfterDnsFailureAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try { return await operation(); }
            catch (Exception exception) when (attempt < 2 && IsDnsResolutionFailure(exception))
            {
                await Task.Delay(TimeSpan.FromMilliseconds(300 * (attempt + 1)), cancellationToken);
            }
        }
    }

    public static bool IsTransientConnectionFailure(Exception? exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is NpgsqlException postgres && postgres.IsTransient) return true;
            if (current is SocketException socket && socket.SocketErrorCode is
                SocketError.HostNotFound or SocketError.TryAgain or SocketError.NoData or SocketError.TimedOut or
                SocketError.ConnectionRefused or SocketError.NetworkUnreachable or SocketError.HostUnreachable)
                return true;
        }
        return false;
    }

    private static bool IsDnsResolutionFailure(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is SocketException socket && socket.SocketErrorCode is SocketError.HostNotFound or SocketError.TryAgain or SocketError.NoData)
                return true;
        }
        return false;
    }
}
