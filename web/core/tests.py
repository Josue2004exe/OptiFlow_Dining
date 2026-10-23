"""Pruebas de autorización, registro y contratos entre Django y microservicios."""
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Profile, RouteConsultation, Zone, TableState, VisionAnalysis


class OptiFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.waiter = User.objects.create_user(username='camilo',password='Segura-12345-Waiter')
        cls.captain = User.objects.create_user(username='capitan',password='Segura-12345-Captain')
        cls.manager = User.objects.create_user(username='gerente',password='Segura-12345-Manager')
        Profile.objects.create(user=cls.waiter,role='mesero')
        Profile.objects.create(user=cls.captain,role='capitan')
        Profile.objects.create(user=cls.manager,role='gerente')
        for code in 'ABC': Zone.objects.create(code=code,level='critica' if code=='C' else 'normal',dwell_minutes=4.5 if code=='C' else .5)
        for i in range(1,9): TableState.objects.create(code=f'mesa{i:02d}')

    def test_register_user_is_waiter_and_logged_in(self):
        response=self.client.post(reverse('register'),{'first_name':'Nora','last_name':'Rivera','username':'norita','email':'nora@example.test','password1':'Clave-Fuerte-238*!','password2':'Clave-Fuerte-238*!'})
        self.assertRedirects(response,reverse('dashboard'))
        self.assertEqual(Profile.objects.get(user__username='norita').role,'mesero')

    def test_role_is_not_escallatable_via_registration(self):
        response=self.client.post(reverse('register'),{'first_name':'Eva','last_name':'Mora','username':'evamora','email':'eva@example.test','password1':'Clave-Fuerte-238*!','password2':'Clave-Fuerte-238*!','role':'admin'})
        self.assertEqual(response.status_code,302)
        self.assertEqual(Profile.objects.get(user__username='evamora').role,'mesero')

    def test_login_required(self):
        self.assertEqual(self.client.get(reverse('dashboard')).status_code,302)
        self.assertEqual(self.client.get(reverse('vision')).status_code,302)

    def test_default_admin_login(self):
        admin = User.objects.create_superuser(username='admin', password='1234', email='admin@optiflow.local')
        response = self.client.post(reverse('login'), {'username': 'admin', 'password': '1234'})
        self.assertRedirects(response, reverse('dashboard'))
        self.assertEqual(int(self.client.session['_auth_user_id']), admin.pk)

    def test_roles_limit_pages(self):
        self.client.force_login(self.waiter)
        self.assertEqual(self.client.get(reverse('routes')).status_code,200)
        self.assertEqual(self.client.get(reverse('saturation')).status_code,403)
        self.assertEqual(self.client.get(reverse('analytics')).status_code,403)
        self.client.force_login(self.captain)
        self.assertEqual(self.client.get(reverse('vision')).status_code,200)
        self.assertEqual(self.client.get(reverse('layout')).status_code,200)
        self.client.force_login(self.manager)
        self.assertEqual(self.client.get(reverse('analytics')).status_code,200)
        self.assertEqual(self.client.get(reverse('routes')).status_code,403)

    @patch('core.views.calculate_route')
    def test_route_api_records_task(self,mocked):
        self.client.force_login(self.waiter)
        mocked.return_value=(200,{'origin':'cocina','destination':'mesa08','path':['0,2','1,2','2,2','3,2','4,2','4,3'],'distance':5,'congested':True,'congested_nodes':['2,2'],'alternative':False,'notice':'Atención'})
        response=self.client.post(reverse('api_route'),data='{"origin":"cocina","destination":"mesa08","task_type":"entrega","avoid_congestion":false}',content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(RouteConsultation.objects.count(),1)
        self.assertTrue(RouteConsultation.objects.first().congested)
        self.assertEqual(self.client.post(reverse('api_complete',args=[response.json()['route_id']])).status_code,200)
        self.assertTrue(RouteConsultation.objects.first().completed)

    def test_captain_can_update_critical_dwell_time(self):
        self.client.force_login(self.captain)
        response=self.client.post(reverse('api_update_zone',args=['C']),data='{"level":"critica","dwell_minutes":6.3}',content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()['alert'])
        self.assertEqual(Zone.objects.get(code='C').dwell_minutes,6.3)

    def test_waiter_cannot_update_zone(self):
        self.client.force_login(self.waiter)
        response=self.client.post(reverse('api_update_zone',args=['C']),data='{"level":"normal","dwell_minutes":0}',content_type='application/json')
        self.assertEqual(response.status_code,403)

    @patch('core.views.optional_upload_s3', return_value='')
    @patch('core.views.analyze_image')
    def test_vision_pipeline_records_metadata(self,mocked,_s3):
        self.client.force_login(self.captain)
        mocked.return_value=(200,{'people_count':2,'zone_counts':{'A':1,'B':1,'C':0},'annotated_image':'data:image/jpeg;base64,abc','disclaimer':'estimación'})
        photo=SimpleUploadedFile('test.jpg',b'fakejpg',content_type='image/jpeg')
        response=self.client.post(reverse('api_vision'),{'file':photo})
        self.assertEqual(response.status_code,200)
        self.assertEqual(VisionAnalysis.objects.count(),1)
        self.assertEqual(VisionAnalysis.objects.first().people_count,2)
