# Multi-stage build: compile with the JDK, run on the smaller JRE.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app

# Copy just the wrapper + POM first so dependency resolution is cached
# across builds and only re-runs when pom.xml actually changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B dependency:go-offline

COPY src/ src/
RUN ./mvnw -B clean package -DskipTests

FROM eclipse-temurin:25-jre
WORKDIR /app

# Run unprivileged (CLAUDE.md, Docker code style). The jar is owned by root
# and only read by the app, so nothing in /app needs to be writable.
RUN groupadd --system --gid 1001 spring \
    && useradd --system --uid 1001 --gid spring --no-create-home spring
COPY --from=build /app/target/*.jar app.jar
USER spring:spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
