import json
import requests
from django.conf import settings

class ServiceUnavailable(Exception): pass


def calculate_route(payload):
    try:
        response=requests.post(settings.ROUTING_SERVICE_URL+'/route',json=payload,timeout=5)
        data=response.json()
        if response.status_code in (400,404):
            return response.status_code,data
        response.raise_for_status()
        return 200,data
    except (requests.RequestException, ValueError) as exc:
        # Fallback local automático para desarrollo sin Docker
        try:
            import sys
            from pathlib import Path
            root = Path(__file__).resolve().parents[2]
            if str(root) not in sys.path: sys.path.insert(0, str(root))
            from services.routing.main import route as local_route, RouteRequest
            from fastapi import HTTPException
            try:
                res = local_route(RouteRequest(**payload))
                return 200, res
            except HTTPException as http_exc:
                return http_exc.status_code, {'detail': http_exc.detail}
        except Exception:
            pass
        raise ServiceUnavailable('El microservicio de rutas no está disponible. Verifica Docker Compose.') from exc


def analyze_image(name, raw, mime):
    try:
        response=requests.post(settings.VISION_SERVICE_URL+'/analyze',files={'file':(name,raw,mime)},timeout=30)
        data=response.json()
        if response.status_code in (400,413,422):
            return response.status_code,data
        response.raise_for_status()
        return 200,data
    except (requests.RequestException, ValueError) as exc:
        # Fallback local automático para desarrollo sin Docker
        try:
            import sys
            from pathlib import Path
            root = Path(__file__).resolve().parents[2]
            if str(root) not in sys.path: sys.path.insert(0, str(root))
            from services.vision.main import analyze_bytes
            try:
                res = analyze_bytes(raw)
                return 200, res
            except ValueError as ve:
                return 400, {'detail': str(ve)}
        except Exception:
            pass
        raise ServiceUnavailable('El microservicio OpenCV no está disponible.') from exc


def optional_upload_s3(raw, name, mime):
    if not settings.AWS_S3_BUCKET:
        return ''
    import boto3
    from uuid import uuid4
    from pathlib import Path
    suffix=Path(name).suffix.lower()
    if suffix not in ('.jpg','.jpeg','.png','.webp'): suffix='.jpg'
    key=f'optiflow/analisis/{uuid4().hex}{suffix}'
    boto3.client('s3',region_name=settings.AWS_REGION).put_object(Bucket=settings.AWS_S3_BUCKET,Key=key,Body=raw,ContentType=mime,ServerSideEncryption='AES256')
    return key
