# OptiFlow Dining · Aplicación web

Proyecto académico de **Construcción de Software**, construido sobre los documentos de requerimientos, Scrum y prototipo de OptiFlow Dining. Esta entrega contiene una aplicación **Django**, dos microservicios **FastAPI**, análisis de fotografías con **OpenCV** e integración **opcional** con **Amazon S3**.

> **Importante:** es un MVP funcional/de demostración, **no** un sistema desplegado en AWS ni una solución de visión artificial validada para estimar ocupación real del restaurante.

## 1. Ejecutar con Docker (recomendado)

Necesitas **Docker Desktop** (Windows, macOS) o Docker Engine con Compose.

```bash
# Desde la carpeta OptiFlow_Dining:
python scripts/generate_env.py
# Crea automáticamente .env con secretos aleatorios.
docker compose up --build -d
```

Abre **http://localhost:8000**. Presiona **«Crear cuenta»** y regístrate. Un usuario nuevo tiene rol **Mesero / Runner**. Luego inicia sesión, entra a «Rutas de servicio», selecciona «Zona de cocina» y «Mesa 08» y calcula la ruta. Verás el mensaje de congestión; pulsa **«Recalcular ruta»** y después **«Finalizar tarea»**. El resultado queda guardado en la base de datos.

Para detener: `docker compose down`. La base de datos se mantiene en el volumen `optiflow_db` (no usar `docker compose down -v` si quieres conservarla).

### Probar los otros perfiles

Por seguridad, el registro público solo crea usuarios **Mesero**. Para administrar los perfiles, primero crea un superusuario:

```bash
docker compose exec web python manage.py createsuperuser
```

Accede a `http://localhost:8000/admin/`, abre **Profiles**, selecciona el usuario y cambia el rol a **Capitán de meseros** o **Gerente general**. También puedes habilitar usuarios demo **solo en un entorno local** con `ENABLE_DEMO_USERS=1` y una clave `DEMO_PASSWORD` robusta en `.env` (mínimo 12 caracteres); reinicia la app. Se crearán `mesero_demo`, `capitan_demo` y `gerente_demo` con la misma contraseña configurada por ti. No habilites cuentas de demostración en producción.

## 2. Módulos disponibles

| Vista / función | Tecnología y comportamiento | Roles |
|---|---|---|
| Registro y login | Django Auth, sesiones protegidas, formularios, contraseñas hash y CSRF | Público |
| Panel principal | Estado del salón y contadores persistidos | Todos |
| M1 Plano y mesas | Esquema de 8 mesas, cambio y persistencia de estados (disponible/activa/ocupada) | Capitán |
| M2 Rutas | Motor Dijkstra en microservicio FastAPI: consulta, detección de nodos congestionados y alternativa; registro y finalización de tareas | Mesero, Capitán |
| M3 Saturación | Modificación de nivel y permanencia, alertas cuando la zona crítica supera 4 minutos | Capitán (edición), Gerente (lectura) |
| M3 Indicadores | Conteos reales de rutas consultadas, recalculadas, finalizadas y zonas críticas | Capitán, Gerente |
| OpenCV | Detección aproximada de personas de pie con HOG en fotografía JPEG/PNG/WebP y división del resultado en tres sectores | Capitán |
| AWS S3 | Resguardo privado opcional de fotografías cuando se configura un bucket e identidad IAM | Capitán |

### Límites de esta iteración

- El **plano es esquemático y precargado**. Aún no existe un editor geométrico completo ni zonificación dinámica automática de mesas.
- El **ruteo** utiliza una red de pasillos de ejemplo (5×5), no sensores físicos ni una representación milimétrica del restaurante. Los estados de congestión se registran manualmente.
- Los indicadores reflejan **registros realmente almacenados**, no métricas inventadas. Los tiempos físicos de desplazamiento, cruces reales y alertas automáticas por sensores necesitarían fuentes de datos adicionales.
- **OpenCV HOG** es un ejemplo de visión computacional clásica. El conteo puede fallar con personas sentadas, oclusiones, tomas cenitales, iluminación insuficiente o aglomeraciones. No se usa reconocimiento facial. La estimación visual **no modifica automáticamente** la saturación operativa del salón.
- El diseño es responsive y sigue la identidad azul marino/naranja del prototipo suministrado.

## 3. Arquitectura de microservicios

```mermaid
flowchart LR
    U[Usuario en navegador] -->|HTTPS en producción| D[Django web + autenticación]
    D --> DB[(SQLite local / RDS PostgreSQL)]
    D -->|REST interno| R[FastAPI: motor de rutas]
    D -->|REST interno + foto| V[FastAPI: OpenCV]
    D -.->|opcional: boto3 + IAM| S3[(Amazon S3 privado)]
```

Contenedores Docker Compose:

- **web**: Django + Django Templates + JS/CSS; REST JSON propio, validación, base de datos, autenticación, roles y AWS SDK (`8000`).
- **routing**: FastAPI independiente; `POST /route`, `GET /layout`, `GET /health` (`8001`, no expuesto públicamente).
- **vision**: FastAPI + OpenCV HOG; `POST /analyze`, `GET /health` (`8002`, no expuesto públicamente).
- **base de datos**: SQLite guardada en volumen Docker para desarrollo. Puede migrarse a PostgreSQL mediante `DATABASE_URL` para producción.

La carpeta `config/salon.json` define las coordenadas iniciales, las mesas y nodos congestionados; es **configuración compartida** empaquetada dentro de cada contenedor, no una base de datos de microservicios.

## 4. Usar AWS en producción

Se proporciona integración de **Amazon S3**; el programa **no crea cuentas, servidores ni recursos cloud por sí solo**. Para probar en AWS:

1. Crea un bucket S3 con acceso público bloqueado (p. ej. `optiflow-evidencias-privadas`) y cifrado habilitado.
2. Crea una instancia **EC2**, instala Docker y asigna un **rol IAM** a la instancia, con permiso `s3:PutObject` **limitado** a `arn:aws:s3:::TU_BUCKET/optiflow/analisis/*`.
3. Clona/copia este proyecto al servidor, genera `.env` y configura `AWS_S3_BUCKET=TU_BUCKET`, `AWS_REGION=us-east-1` (o la región elegida).
4. Configura `ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` y `DJANGO_SECRET_KEY` correctamente. Sitúa la app detrás de un proxy/ALB con **HTTPS** y activa `DJANGO_SECURE_SSL_REDIRECT=1`. No expongas los microservicios a Internet.
5. Para persistencia escalable, crea **Amazon RDS PostgreSQL** con acceso privado y define `DATABASE_URL=postgresql://usuario:contraseña@host:5432/basedatos` en tu gestor de secretos / entorno. Haz `python manage.py migrate` al cambiar la base de datos.

No coloques `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY` en archivos versionados. El SDK `boto3` usa automáticamente credenciales temporales del rol IAM de EC2. La foto original solo se almacena en S3 si está configurado `AWS_S3_BUCKET`; Django guarda únicamente los metadatos, y la respuesta anotada se envía al navegador. Se recomienda obtener consentimiento antes de procesar fotografías de personas y definir políticas de retención en S3.

## 5. Ejecución local sin Docker (alternativa)

Con Python 3.11 o superior, desde el directorio raíz:

```bash
python scripts/generate_env.py
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
python -m pip install -r web/requirements.txt
python -m pip install -r services/routing/requirements.txt
python -m pip install -r services/vision/requirements.txt
```

Abre **tres terminales**, todas con el entorno virtual activado y situadas en `OptiFlow_Dining`:

```bash
# Terminal 1 (rutas)
python -m uvicorn services.routing.main:app --port 8001

# Terminal 2 (visión)
python -m uvicorn services.vision.main:app --port 8002

# Terminal 3 (web)
cd web
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

La variable `DATABASE_URL` permite PostgreSQL; de lo contrario Django crea SQLite local. Para configurar contraseñas secretas no se requiere un servicio externo.

## 6. Pruebas y validación

```bash
# Con Docker activo:
docker compose exec web python manage.py test core

docker compose exec routing python -c "from service.main import route,RouteRequest; print(route(RouteRequest(zone_levels={'C':'critica'})))"

docker compose exec vision python -c "import cv2; print('OpenCV', cv2.__version__)"
```

Se incluyen pruebas automáticas para registro, restricción de roles, recálculo y almacenamiento de consultas. Se pueden probar directamente las funciones de ruteo de `services/routing/test_routing.py` si tienes pytest. **Es necesario ejecutar estas pruebas completas en un entorno con Django y las dependencias instaladas**.

### Endpoints de ejemplo

```json
POST /api/rutas/
{"origin":"cocina","destination":"mesa08","task_type":"entrega","avoid_congestion":false}
```

Necesitas iniciar sesión y enviar la cookie de sesión y el token CSRF. En la interfaz web esto se gestiona automáticamente.

## 7. Estructura del proyecto

```text
OptiFlow_Dining/
  docker-compose.yml         Orquestación de 3 servicios
  .env.example               Variables de entorno sin secretos reales
  scripts/generate_env.py    Generador de contraseñas seguras
  config/salon.json          Distribución y nodos del ejemplo
  web/
    optiflow/               Configuración Django
    core/                   Roles, modelos, vistas REST, tests y migraciones
    templates/              Interfaces de inicio, registro, panel y módulos
    static/css/app.css       Estilos responsive azul/naranja
    static/js/app.js         Interacción de mapas, rutas, zonas y OpenCV
  services/
    routing/                 Microservicio de trayectorias
    vision/                  Microservicio de OpenCV
```

## 8. Relación con las entregas adjuntas

- **Requerimientos (Tarea 2):** se conservan los 3 módulos M1/M2/M3, los actores y la comunicación REST, y se implementan parcialmente las historias HU-01 a HU-05.
- **Scrum/Jira (Tarea 3):** la alerta de saturación contiene la **zona/nodo afectado y el tiempo de permanencia**, como recoge la modificación a HU-04.
- **Prototipo (Tarea 4):** se conserva la navegación *login → panel → tarea → ruta → congestión → alternativa → finalizar*, así como el código de color azul/naranja y las pantallas de saturación e indicadores.
- **Extensión solicitada en este encargo:** Django, registro de usuarios, microservicios, Amazon S3 y OpenCV.

**Aclaración:** Este paquete contiene el código fuente y la configuración de arranque. La ejecución integral y el despliegue en una cuenta AWS dependen del entorno y de las credenciales del usuario.
