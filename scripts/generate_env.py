"""Crear .env para entorno local sin sobrescribir secretos existentes."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / '.env'
if target.exists():
    raise SystemExit('.env ya existe: no se sobrescribió.')
sample = (root / '.env.example').read_text(encoding='utf-8')
sample = sample.replace('REEMPLAZAR_POR_CLAVE_ALEATORIA', secrets.token_urlsafe(64))
sample = sample.replace('REEMPLAZAR_POR_CONTRASENA_SEGURA', secrets.token_urlsafe(18))
target.write_text(sample, encoding='utf-8')
try: target.chmod(0o600)
except OSError: pass
print('Archivo .env creado con secretos aleatorios. Guarda tus credenciales fuera de Git.')
