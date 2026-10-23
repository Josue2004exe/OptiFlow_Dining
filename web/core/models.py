from django.conf import settings
from django.db import models

class Profile(models.Model):
    ROLE_CHOICES = [('mesero','Mesero / Runner'),('capitan','Capitán de meseros'),('gerente','Gerente general')]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default='mesero')
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f'{self.user.username} ({self.get_role_display()})'

class TableState(models.Model):
    STATE_CHOICES = [('disponible','Disponible'),('activa','Activa'),('ocupada','Ocupada')]
    code = models.CharField(max_length=12, unique=True)
    state = models.CharField(max_length=12, choices=STATE_CHOICES, default='disponible')
    assigned_to = models.CharField(max_length=80, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self): return f'{self.code} {self.state}'

class Zone(models.Model):
    LEVEL_CHOICES = [('normal','Normal'),('moderada','Moderada'),('critica','Crítica')]
    code = models.CharField(max_length=1, unique=True)
    level = models.CharField(max_length=12, choices=LEVEL_CHOICES, default='normal')
    dwell_minutes = models.FloatField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self): return f'Zona {self.code}: {self.level}'

class RouteConsultation(models.Model):
    TASK_TYPES = [('entrega','Entrega de comida'),('retiro','Retiro de vajilla')]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    origin = models.CharField(max_length=20)
    destination = models.CharField(max_length=20)
    task_type = models.CharField(max_length=12, choices=TASK_TYPES, default='entrega')
    path = models.JSONField(default=list)
    distance = models.PositiveIntegerField(default=0)
    recalculated = models.BooleanField(default=False)
    congested = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f'{self.origin} → {self.destination}'

class VisionAnalysis(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    filename = models.CharField(max_length=180)
    people_count = models.PositiveIntegerField(default=0)
    zone_counts = models.JSONField(default=dict)
    s3_key = models.CharField(max_length=300,blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f'{self.filename}: {self.people_count} detecciones'
