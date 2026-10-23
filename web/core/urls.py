from django.urls import path
from . import views
urlpatterns=[
    path('',views.landing,name='landing'),
    path('registro/',views.register_view,name='register'),
    path('login/',views.login_view,name='login'),
    path('logout/',views.logout_view,name='logout'),
    path('panel/',views.dashboard,name='dashboard'),
    path('rutas/',views.routes_view,name='routes'),
    path('saturacion/',views.saturation_view,name='saturation'),
    path('indicadores/',views.analytics_view,name='analytics'),
    path('plano/',views.layout_view,name='layout'),
    path('vision/',views.vision_view,name='vision'),
    path('api/rutas/',views.api_route,name='api_route'),
    path('api/rutas/<int:pk>/finalizar/',views.api_complete,name='api_complete'),
    path('api/zonas/<str:code>/',views.api_update_zone,name='api_update_zone'),
    path('api/mesas/<str:code>/',views.api_update_table,name='api_update_table'),
    path('api/vision/',views.api_vision,name='api_vision'),
]
