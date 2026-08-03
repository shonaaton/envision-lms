# Envision LMS Android APK

This folder contains a small native Android wrapper for the hosted LMS.

- App URL: `https://classroom.envisionchessacademy.com`
- Package: `com.envisionchessacademy.lms`
- Output APK: `build/outputs/envision-lms-debug.apk`

Run one of these from this folder:

```powershell
.\build-apk.ps1 -AppUrl "https://classroom.envisionchessacademy.com"
```

If you need the legacy SDK path:

```powershell
.\build-apk-legacy.ps1 -AppUrl "https://classroom.envisionchessacademy.com"
```
