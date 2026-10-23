from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name='Profile',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('role', models.CharField(max_length=12, default='mesero', choices=[('mesero','Mesero / Runner'),('capitan','Capitán de meseros'),('gerente','Gerente general')])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.OneToOneField(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.CASCADE, related_name='profile')),
            ],
        ),
        migrations.CreateModel(
            name='TableState',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=12, unique=True)),
                ('state', models.CharField(max_length=12, default='disponible', choices=[('disponible','Disponible'),('activa','Activa'),('ocupada','Ocupada')])),
                ('assigned_to', models.CharField(max_length=80, blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='Zone',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=1, unique=True)),
                ('level', models.CharField(max_length=12, default='normal', choices=[('normal','Normal'),('moderada','Moderada'),('critica','Crítica')])),
                ('dwell_minutes', models.FloatField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name='RouteConsultation',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('origin', models.CharField(max_length=20)),
                ('destination', models.CharField(max_length=20)),
                ('task_type', models.CharField(max_length=12, default='entrega', choices=[('entrega','Entrega de comida'),('retiro','Retiro de vajilla')])),
                ('path', models.JSONField(default=list)),
                ('distance', models.PositiveIntegerField(default=0)),
                ('recalculated', models.BooleanField(default=False)),
                ('congested', models.BooleanField(default=False)),
                ('completed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.CASCADE)),
            ],
        ),
        migrations.CreateModel(
            name='VisionAnalysis',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('filename', models.CharField(max_length=180)),
                ('people_count', models.PositiveIntegerField(default=0)),
                ('zone_counts', models.JSONField(default=dict)),
                ('s3_key', models.CharField(max_length=300, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.CASCADE)),
            ],
        ),
    ]
