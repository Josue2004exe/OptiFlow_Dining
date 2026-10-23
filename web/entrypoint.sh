#!/bin/sh
set -e
python manage.py migrate --noinput
python manage.py seed_demo
exec gunicorn optiflow.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 45 --access-logfile -
