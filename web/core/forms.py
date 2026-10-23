from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User

class RegisterForm(UserCreationForm):
    first_name = forms.CharField(label='Nombre',max_length=50)
    last_name = forms.CharField(label='Apellido',max_length=50)
    email = forms.EmailField(label='Correo electrónico',required=True)
    class Meta:
        model=User
        fields=('first_name','last_name','username','email','password1','password2')
        labels={'username':'Nombre de usuario'}
    def clean_email(self):
        email=self.cleaned_data['email'].lower().strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError('Este correo electrónico ya está registrado.')
        return email
    def save(self,commit=True):
        user=super().save(commit=False)
        user.email=self.cleaned_data['email']
        if commit: user.save()
        return user

class LoginForm(AuthenticationForm):
    username=forms.CharField(label='Usuario')
    password=forms.CharField(label='Contraseña',widget=forms.PasswordInput)
