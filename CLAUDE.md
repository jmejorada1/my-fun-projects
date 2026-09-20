# Project Name

## Context
- **Tech Stack:** Angular (TypeScript), Java (Spring Boot), Python, Docker
- **Environment:** Multi-service application managed via Docker/Local runtimes

## Core Commands

### Frontend (Angular)
- **Install:** `npm install` or `ng cache clean`
- **Build:** `ng build`
- **Lint / Typecheck:** `ng lint`
- **Test (All):** `ng test --watch=false`
- **Test (Single):** `ng test --include=<path-to-spec-file>`

### Backend (Java / Spring Boot)
- **Build (Maven):** `./mvnw clean package -DskipTests` *(or `gradlew build -x test` if using Gradle)*
- **Test (All):** `./mvnw test`
- **Test (Single):** `./mvnw test -Dtest=ClassName#methodName`

### Scripts & Microservices (Python)
- **Env Setup:** `python -m venv venv && source venv/bin/activate`
- **Install:** `pip install -r requirements.txt`
- **Test (All):** `pytest`
- **Test (Single):** `pytest <path_to_file>::test_function_name`

### Infrastructure (Docker)
- **Up / Down:** `docker-compose up -d` / `docker-compose down`
- **Rebuild Service:** `docker-compose up -d --build <service-name>`
- **View Logs:** `docker-compose logs -f --tail=100 <service-name>`

## Code Style & Rules
- **Angular:** Strict TypeScript typing (`noImplicitAny`). Use standalone components where applicable.
- **Java:** Follow standard Spring Boot idioms. Use Lombok to reduce boilerplate. Match existing package structure.
- **Python:** Adhere to PEP 8 standards. Include explicit type hints for function arguments and returns.
- **Docker:** Optimize layers; keep images lightweight (e.g., use alpine/slim bases). Use non-root users.

## Token Optimization (Crucial)
- **Token Budget Strategy:** Keep conversation turns short. If debugging a complex bug, immediately use `/compact` if the session warning triggers.
- **Session Reset Strategy:** Run `/clear` immediately when shifting focus between frontend, backend, or Docker tasks to prevent carrying dead history tokens forward.
