FROM python:3.12-slim
WORKDIR /app
COPY services/routing/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY config /app/config
COPY services/routing /app/service
EXPOSE 8001
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8001"]
