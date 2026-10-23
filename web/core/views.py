"""Páginas Django y APIs REST protegidas con sesión, CSRF y permisos por rol."""
import json
from functools import wraps
from datetime import timedelta
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db.models import Count
from django.http import JsonResponse, HttpResponseForbidden
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_POST
from .forms import RegisterForm, LoginForm
from .layout import get_layout
from .models import Profile, TableState, Zone, RouteConsultation, VisionAnalysis
from .services import calculate_route, analyze_image, optional_upload_s3, ServiceUnavailable


def role_for(user):
    if not user.is_authenticated: return None
    if user.is_superuser: return 'admin'
    profile=Profile.objects.filter(user=user).first()
    return profile.role if profile else 'mesero'


def role_required(*allowed):
    def decorator(func):
        @login_required
        @wraps(func)
        def wrapped(request,*args,**kwargs):
            if role_for(request.user) not in set(allowed)|{'admin'}:
                return HttpResponseForbidden('No tienes permisos para acceder a esta función.')
            return func(request,*args,**kwargs)
        return wrapped
    return decorator


def page_context(request, page_title, active):
    user=request.user
    full_name=user.get_full_name() or user.username
    layout=get_layout()
    return {'page_title':page_title,'active':active,'role':role_for(user),'display_name':full_name,
            'layout':layout,'layout_json':json.dumps(layout,ensure_ascii=False),
            'zones':list(Zone.objects.order_by('code')),
            'tables_state':list(TableState.objects.order_by('code'))}


def landing(request):
    if request.user.is_authenticated: return redirect('dashboard')
    return render(request,'landing.html',{'page_title':'Bienvenido'})


def register_view(request):
    if request.user.is_authenticated: return redirect('dashboard')
    form=RegisterForm(request.POST or None)
    if request.method=='POST' and form.is_valid():
        user=form.save()
        Profile.objects.create(user=user,role='mesero')
        login(request,user)
        messages.success(request,'Tu cuenta se creó correctamente. Bienvenido a OptiFlow.')
        return redirect('dashboard')
    return render(request,'register.html',{'form':form,'page_title':'Crear cuenta'})


def login_view(request):
    if request.user.is_authenticated: return redirect('dashboard')
    if request.method == 'POST':
        form = LoginForm(request, data=request.POST)
        if form.is_valid():
            login(request, form.get_user())
            nxt = request.POST.get('next') or request.GET.get('next')
            if nxt and nxt.startswith('/') and not nxt.startswith('//'):
                return redirect(nxt)
            return redirect('dashboard')
    else:
        form = LoginForm(request, initial={'username': 'admin'})
    return render(request, 'login.html', {'form': form, 'page_title': 'Iniciar sesión', 'next': request.GET.get('next', '')})


@login_required
@require_POST
def logout_view(request):
    logout(request)
    return redirect('landing')


@login_required
def dashboard(request):
    context=page_context(request,'Panel principal','dashboard')
    routes=RouteConsultation.objects.count()
    recalculated=RouteConsultation.objects.filter(recalculated=True).count()
    congestion=Zone.objects.filter(level='critica').count()
    context.update({'total_routes':routes,'recalculated':recalculated,'congestion_count':congestion,
                    'last_routes':RouteConsultation.objects.select_related('user').order_by('-created_at')[:5],
                    'recent_vision':VisionAnalysis.objects.order_by('-created_at').first()})
    return render(request,'dashboard.html',context)


@role_required('mesero','capitan')
def routes_view(request):
    context=page_context(request,'Consultar rutas','routes')
    context['recent_routes']=RouteConsultation.objects.filter(user=request.user).order_by('-created_at')[:5]
    return render(request,'routes.html',context)


@role_required('capitan','gerente')
def saturation_view(request):
    context=page_context(request,'Saturación del salón','saturation')
    context['critical_zones']=Zone.objects.filter(level='critica',dwell_minutes__gt=4)
    return render(request,'saturation.html',context)


@role_required('gerente','capitan')
def analytics_view(request):
    context=page_context(request,'Indicadores operativos','analytics')
    totals=RouteConsultation.objects.count()
    completed=RouteConsultation.objects.filter(completed=True).count()
    context.update({'total_routes':totals,'completed':completed,
                    'recalculated':RouteConsultation.objects.filter(recalculated=True).count(),
                    'critical_count':Zone.objects.filter(level='critica').count(),
                    'last_routes':RouteConsultation.objects.order_by('-created_at')[:6],
                    'vision_count':VisionAnalysis.objects.count()})
    return render(request,'analytics.html',context)


@role_required('capitan')
def layout_view(request):
    return render(request,'layout.html',page_context(request,'Plano y mesas','layout'))


@role_required('capitan')
def vision_view(request):
    context=page_context(request,'Análisis con OpenCV','vision')
    context['analysis_history']=VisionAnalysis.objects.order_by('-created_at')[:6]
    context['s3_enabled']=bool(settings.AWS_S3_BUCKET)
    return render(request,'vision.html',context)


def json_body(request):
    try:
        obj=json.loads(request.body.decode('utf-8'))
        if not isinstance(obj,dict): raise ValueError('Se esperaba un objeto JSON')
        return obj
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return None


@require_POST
@role_required('mesero','capitan')
def api_route(request):
    data=json_body(request)
    if data is None: return JsonResponse({'error':'JSON inválido'},status=400)
    layout=get_layout()
    origins={x['id'] for x in layout['origins']}
    targets={x['id'] for x in layout['tables']}
    origin=data.get('origin','cocina')
    destination=data.get('destination','mesa08')
    task_type=data.get('task_type','entrega')
    avoid=data.get('avoid_congestion',False)
    if origin not in origins or destination not in targets or task_type not in ('entrega','retiro') or not isinstance(avoid,bool):
        return JsonResponse({'error':'Origen, destino o tipo de tarea inválido'},status=400)
    zone_levels={z.code:z.level for z in Zone.objects.all()}
    try:
        status,result=calculate_route({'origin':origin,'destination':destination,'task_type':task_type,
                                       'avoid_congestion':avoid,'zone_levels':zone_levels})
    except ServiceUnavailable as exc:
        return JsonResponse({'error':str(exc)},status=503)
    if status!=200:
        return JsonResponse({'error':result.get('detail','No existe una ruta disponible')},status=status)
    record=RouteConsultation.objects.create(user=request.user,origin=origin,destination=destination,
        task_type=task_type,path=result['path'],distance=result['distance'],recalculated=avoid,
        congested=result['congested'])
    result['route_id']=record.id
    return JsonResponse(result)


@require_POST
@role_required('mesero','capitan')
def api_complete(request,pk):
    record=get_object_or_404(RouteConsultation,pk=pk,user=request.user)
    record.completed=True
    record.save(update_fields=['completed'])
    return JsonResponse({'success':True,'message':'Tarea finalizada correctamente'})


@require_POST
@role_required('capitan')
def api_update_zone(request,code):
    data=json_body(request)
    if data is None: return JsonResponse({'error':'JSON inválido'},status=400)
    zone=get_object_or_404(Zone,code=code.upper())
    level=data.get('level')
    if level not in ('normal','moderada','critica'):
        return JsonResponse({'error':'Nivel no válido'},status=400)
    try:
        minutes=float(data.get('dwell_minutes',0))
    except (ValueError,TypeError):
        return JsonResponse({'error':'Tiempo de permanencia inválido'},status=400)
    if minutes < 0 or minutes > 240:
        return JsonResponse({'error':'El tiempo debe estar entre 0 y 240 minutos'},status=400)
    zone.level=level
    zone.dwell_minutes=minutes
    zone.save()
    return JsonResponse({'success':True,'code':zone.code,'level':zone.level,'dwell_minutes':minutes,
                         'alert':level=='critica' and minutes>4})


@require_POST
@role_required('capitan')
def api_update_table(request,code):
    data=json_body(request)
    if data is None: return JsonResponse({'error':'JSON inválido'},status=400)
    table=get_object_or_404(TableState,code=code)
    state=data.get('state')
    if state not in ('disponible','activa','ocupada'):
        return JsonResponse({'error':'Estado no válido'},status=400)
    table.state=state
    table.save(update_fields=['state','updated_at'])
    return JsonResponse({'success':True,'code':table.code,'state':state})


@require_POST
@role_required('capitan')
def api_vision(request):
    uploaded=request.FILES.get('file')
    if not uploaded:
        return JsonResponse({'error':'Selecciona una imagen.'},status=400)
    valid_types={'image/jpeg','image/png','image/webp'}
    if uploaded.content_type not in valid_types or uploaded.size>5*1024*1024:
        return JsonResponse({'error':'Solo JPEG, PNG o WebP de máximo 5 MB.'},status=400)
    raw=uploaded.read()
    if len(raw)>5*1024*1024: return JsonResponse({'error':'Archivo demasiado grande.'},status=413)
    try:
        status,result=analyze_image(uploaded.name,raw,uploaded.content_type)
    except ServiceUnavailable as exc:
        return JsonResponse({'error':str(exc)},status=503)
    if status!=200:
        return JsonResponse({'error':result.get('detail','Imagen inválida')},status=status)
    try:
        s3_key=optional_upload_s3(raw, uploaded.name, uploaded.content_type)
    except Exception:
        # El análisis sí funciona si AWS está temporalmente inoperativo; informar explícitamente.
        s3_key=''
        result['aws_warning']='No se pudo guardar la imagen en AWS S3. Revisa el bucket y los permisos IAM.'
    VisionAnalysis.objects.create(user=request.user, filename=uploaded.name[:180],
        people_count=result['people_count'],zone_counts=result['zone_counts'],s3_key=s3_key)
    result['aws_saved']=bool(s3_key)
    return JsonResponse(result)
