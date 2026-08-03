param(
    [string]$SdkRoot = "C:\Users\User\Downloads\android-sdk",
    [string]$AppUrl = "https://classroom.envisionchessacademy.com",
    [string]$LegacyJavaBin = "C:\Program Files (x86)\DownloadUtility3.4\jre\bin"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
if (Test-Path -LiteralPath (Join-Path $SdkRoot "android-sdk")) {
    $SdkRoot = Join-Path $SdkRoot "android-sdk"
}

$AndroidJar = Join-Path $SdkRoot "platforms\android-10\android.jar"
$Aapt = Join-Path $SdkRoot "platform-tools\aapt.exe"
$Dx = Join-Path $SdkRoot "platform-tools\dx.bat"
$DxJar = Join-Path $SdkRoot "platform-tools\lib\dx.jar"
$ZipAlign = Join-Path $SdkRoot "tools\zipalign.exe"
$Manifest = Join-Path $ProjectRoot "app\src\main\AndroidManifest.xml"
$Resources = Join-Path $ProjectRoot "app\src\main\res"
$JavaRoot = Join-Path $ProjectRoot "app\src\main\java"
$JavaSource = Join-Path $JavaRoot "com\envisionchessacademy\lms\MainActivity.java"
$BuildDir = Join-Path $ProjectRoot "build\legacy"
$GenDir = Join-Path $BuildDir "gen"
$ClassesDir = Join-Path $BuildDir "classes"
$DexPath = Join-Path $BuildDir "classes.dex"
$UnsignedApk = Join-Path $BuildDir "envision-lms-unsigned.apk"
$DexedApk = Join-Path $BuildDir "envision-lms-dexed.apk"
$SignedApk = Join-Path $BuildDir "envision-lms-signed.apk"
$OutputDir = Join-Path $ProjectRoot "build\outputs"
$FinalApk = Join-Path $OutputDir "envision-lms-debug.apk"
$Keystore = Join-Path $ProjectRoot "debug.keystore"

foreach ($Path in @($AndroidJar, $Aapt, $DxJar, $ZipAlign)) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Required Android SDK file not found: $Path"
    }
}

function Set-ClassFileMajorVersion([string]$Directory, [byte]$MajorVersion) {
    Get-ChildItem -Path $Directory -Recurse -Filter "*.class" | ForEach-Object {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        if ($bytes.Length -gt 8 -and $bytes[0] -eq 0xCA -and $bytes[1] -eq 0xFE -and $bytes[2] -eq 0xBA -and $bytes[3] -eq 0xBE) {
            $bytes[6] = 0
            $bytes[7] = $MajorVersion
            [System.IO.File]::WriteAllBytes($_.FullName, $bytes)
        }
    }
}

if (Test-Path -LiteralPath $BuildDir) {
    Remove-Item -LiteralPath $BuildDir -Recurse -Force
}
foreach ($Path in @($GenDir, $ClassesDir, $OutputDir)) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

$source = Get-Content -Raw -LiteralPath $JavaSource
$source = $source -replace 'private static final String APP_URL = ".*?";', "private static final String APP_URL = `"$AppUrl`";"
Set-Content -LiteralPath $JavaSource -Value $source -NoNewline

& $Aapt package -f -m -J $GenDir -M $Manifest -S $Resources -I $AndroidJar
if ($LASTEXITCODE -ne 0) {
    throw "Android resource generation failed."
}

$JavaFiles = @(Get-ChildItem -Path $JavaRoot, $GenDir -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
& javac -source 8 -target 8 -bootclasspath $AndroidJar -d $ClassesDir @JavaFiles
if ($LASTEXITCODE -ne 0) {
    throw "Java compilation failed."
}
Set-ClassFileMajorVersion -Directory $ClassesDir -MajorVersion 50

$LegacyJava = Join-Path $LegacyJavaBin "java.exe"
if (-not (Test-Path -LiteralPath $LegacyJava)) {
    throw "Java 8 runtime not found: $LegacyJava"
}
& $LegacyJava -Xmx1024M -jar $DxJar --dex --output=$DexPath $ClassesDir
if ($LASTEXITCODE -ne 0) {
    throw "DEX compilation failed."
}

& $Aapt package -f -M $Manifest -S $Resources -I $AndroidJar -F $UnsignedApk
if ($LASTEXITCODE -ne 0) {
    throw "APK packaging failed."
}

Copy-Item -LiteralPath $UnsignedApk -Destination $DexedApk -Force
& $Aapt add $DexedApk $DexPath
if ($LASTEXITCODE -ne 0) {
    throw "Adding compiled code to APK failed."
}

if (-not (Test-Path -LiteralPath $Keystore)) {
    & keytool -genkeypair -v -keystore $Keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
    if ($LASTEXITCODE -ne 0) {
        throw "Debug keystore generation failed."
    }
}

& jarsigner -keystore $Keystore -storepass android -keypass android -signedjar $SignedApk $DexedApk androiddebugkey
if ($LASTEXITCODE -ne 0) {
    throw "APK signing failed."
}

& $ZipAlign -f 4 $SignedApk $FinalApk
if ($LASTEXITCODE -ne 0) {
    throw "APK alignment failed."
}

& jarsigner -verify $FinalApk
if ($LASTEXITCODE -ne 0) {
    throw "APK verification failed."
}

Get-Item -LiteralPath $FinalApk
