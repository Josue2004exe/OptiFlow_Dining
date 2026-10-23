FROM python:3.12-slim
ENV OPENCV_IO_MAX_IMAGE_PIXELS=16000000
WORKDIR /app
COPY services/vision/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/vision /app/service
EXPOSE 8002
CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8002"]
