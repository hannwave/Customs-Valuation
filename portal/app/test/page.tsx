import { Button, Container, Title, Group } from '@mantine/core';

export default function HomePage() {
  return (
    <Container size="lg" py="xl">
      <Title order={1} ta="center" mb="md">
        Welcome to Mantine UI
      </Title>
      <Group justify="center">
        <Button variant="filled" color="blue">
          Click me
        </Button>
        <Button variant="light" color="teal">
          Learn More
        </Button>
      </Group>
    </Container>
  );
}