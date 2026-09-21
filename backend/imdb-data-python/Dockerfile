FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY import_resources.py config.yaml import_bigotry_data.py bigotry-config.yaml import_standard_data.py standard-config.yaml ./
COPY sample-data/ sample-data/

# db_host/db_port in config.yaml/bigotry-config.yaml default to localhost,
# which only makes sense on a host machine. Baking the container-network
# host/port into ENTRYPOINT (not CMD) means they always apply but any args
# passed to `docker compose run <service> ...` still get appended after
# them, e.g. `docker compose run --rm imdb-loader --start-row 1 --end-row 10000`.
# The imdb-loader/bigotry-loader compose services override this ENTRYPOINT
# to point at import_resources.py / import_bigotry_data.py respectively.
ENTRYPOINT ["python3", "import_resources.py", "--db-host", "postgres", "--db-port", "5432"]
