from django.contrib import admin
from .models import Profile, TableState, Zone, RouteConsultation, VisionAnalysis

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display=('user','role','created_at')
    list_filter=('role',)
    search_fields=('user__username','user__email')

@admin.register(TableState)
class TableStateAdmin(admin.ModelAdmin):
    list_display=('code','state','assigned_to','updated_at')
    list_filter=('state',)

@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display=('code','level','dwell_minutes','updated_at')
    list_filter=('level',)

@admin.register(RouteConsultation)
class RouteConsultationAdmin(admin.ModelAdmin):
    list_display=('user','origin','destination','recalculated','congested','completed','created_at')
    list_filter=('recalculated','congested','completed')

admin.site.register(VisionAnalysis)
admin.site.site_header = 'OptiFlow Dining · Administración'
