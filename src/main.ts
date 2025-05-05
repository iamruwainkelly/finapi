import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle("NestJS Finance API")
    .setDescription("The NestJS Finance API description")
    .setVersion("1.0")
    .addTag("yahoo-finance")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  // Enable CORS for all origins
  app.enableCors();

  await app.listen(process.env.PORT ?? 3030).then(() => {
    console.log(`Server is running on port ${process.env.PORT ?? 3030}`);
    console.log(
      `Swagger is running on http://localhost:${process.env.PORT ?? 3030}/api`,
    );
  });
}
bootstrap();
