FROM maven:3.10.0-eclipse-temurin-25 AS build

WORKDIR /workspace
COPY pom.xml ./
COPY src/main/ src/main/
RUN mvn -B -ntp -Dmaven.test.skip=true package

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /workspace/target/civicresolve-backend-*.jar /app/app.jar
USER 10001:10001
EXPOSE 10000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
