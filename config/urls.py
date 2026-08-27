"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path
from django.views.generic import RedirectView

from caricamento.health import healthz, worker_healthz
from caricamento import views

urlpatterns = [
    path(
        "favicon.ico",
        RedirectView.as_view(
            url="/static/caricamento/img/icons8-3d-64.png",
            permanent=False,
        ),
    ),
    path('healthz/', healthz, name='healthz'),
    path('worker-healthz/', worker_healthz, name='worker_healthz'),
    path('admin/', admin.site.urls),
    # django-allauth (Google OAuth2) — deve stare fuori dal namespace 'caricamento'
    path('accounts/', include('allauth.urls')),
    # Password reset (forgot password)
    path('password-reset/',
         auth_views.PasswordResetView.as_view(
             template_name='caricamento/password_reset.html',
             email_template_name='caricamento/password_reset_email.html',
             subject_template_name='caricamento/password_reset_subject.txt',
             success_url='/password-reset/done/',
         ),
         name='password_reset'),
    path('password-reset/done/',
         auth_views.PasswordResetDoneView.as_view(
             template_name='caricamento/password_reset_done.html',
         ),
         name='password_reset_done'),
    path('password-reset/<uidb64>/<token>/',
         auth_views.PasswordResetConfirmView.as_view(
             template_name='caricamento/password_reset_confirm.html',
             success_url='/password-reset/complete/',
         ),
         name='password_reset_confirm'),
    path('password-reset/complete/',
         auth_views.PasswordResetCompleteView.as_view(
             template_name='caricamento/password_reset_complete.html',
         ),
         name='password_reset_complete'),
    # Pagine legali pubbliche (Privacy, Cookie Policy, Termini, Rimborsi)
    path('privacy/', views.pagina_legale, {'slug': 'privacy'}, name='privacy'),
    path('cookie-policy/', views.pagina_legale, {'slug': 'cookie-policy'}, name='cookie_policy'),
    path('termini/', views.pagina_legale, {'slug': 'termini'}, name='termini'),
    path('rimborsi/', views.pagina_legale, {'slug': 'rimborsi'}, name='rimborsi'),
    # API REST dell'ottimizzazione carico 3D
    path('', include('caricamento.urls')),
]
