FROM python:3.14-slim@sha256:cad9a2c871761c413caa6fdd6441c783451e740a48aaeba60ae62a8b53525ef6
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/navigator_app ./navigator_app
USER 10001:10001
EXPOSE 8506
CMD ["gunicorn", "--bind", "0.0.0.0:8506", "--workers", "1", "--threads", "4", "--timeout", "900", "navigator_app:create_app()"]
