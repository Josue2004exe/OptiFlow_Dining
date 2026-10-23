import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import Profile, TableState, Zone

class Command(BaseCommand):
    help = 'Crea zonas/mesas iniciales y, solo si se solicita, usuarios de prueba.'
    def handle(self, *args, **options):
        for code,level,dwell in [('A','normal',0.8),('B','moderada',2.4),('C','critica',4.6)]:
            Zone.objects.get_or_create(code=code, defaults={'level':level,'dwell_minutes':dwell})
        for n in range(1,9):
            TableState.objects.get_or_create(code=f'mesa{n:02d}')
        
        # Usuario admin por defecto con clave 1234
        admin_user, _ = User.objects.get_or_create(username='admin', defaults={'email': 'admin@optiflow.local'})
        admin_user.set_password('1234')
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
        Profile.objects.get_or_create(user=admin_user, defaults={'role': 'capitan'})

        if os.environ.get('ENABLE_DEMO_USERS','0')=='1':
            password=os.environ.get('DEMO_PASSWORD','')
            if len(password)<12 or password=='REEMPLAZAR_POR_CONTRASENA_SEGURA':
                self.stderr.write('No se crearon usuarios demo: DEMO_PASSWORD debe tener al menos 12 caracteres.')
                return
            for name,role in [('mesero_demo','mesero'),('capitan_demo','capitan'),('gerente_demo','gerente')]:
                user,created=User.objects.get_or_create(username=name, defaults={'email':f'{name}@example.invalid'})
                if created: user.set_password(password); user.save()
                Profile.objects.get_or_create(user=user, defaults={'role':role})
        self.stdout.write(self.style.SUCCESS('OptiFlow preparado: mesas y zonas inicializadas.'))
