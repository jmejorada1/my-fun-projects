FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY import_resources.py config.yaml ./

# db_host/db_port in config.yaml default to localhost, which only makes
# sense on a host machine. Baking the container-network host/port into
# ENTRYPOINT (not CMD) means they always apply but any args passed to
# `docker compose run imdb-loader ...` still get appended after them, e.g.
# `docker compose run --rm imdb-loader --start-row 1 --end-row 10000`.
ENTRYPOINT ["python3", "import_resources.py", "--db-host", "postgres", "--db-port", "5432"]
