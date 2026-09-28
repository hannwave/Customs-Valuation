using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260919100000_EnforceLocationHierarchy")]
partial class EnforceLocationHierarchy { }
