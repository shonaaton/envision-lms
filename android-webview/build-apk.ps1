param(
    [string]$SdkRoot = "",
    [string]$AppUrl = "https://classroom.envisionchessacademy.com"
)

$ErrorActionPreference = "Stop"

$CommandLineToolsVersion = "11076708"
$BuildToolsVersion = "35.0.0"
$PlatformVersion = "android-35"
$ProjectRoot = $PSScriptRoot
$WorkspaceRoot = [System.IO.Directory]::GetParent([System.IO.Directory]::GetParent([System.IO.Directory]::GetParent($ProjectRoot).FullName).FullName).FullName
if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    $SdkRoot = Join-Path $WorkspaceRoot "android-sdk"
}
$AppPackage = "com.envisionchessacademy.lms"
$OutputDir = Join-Path $ProjectRoot "build\outputs"
$BuildDir = Join-Path $ProjectRoot "build\intermediates"
$DownloadsDir = Join-Path $WorkspaceRoot "android-sdk-downloads"
$CommandLineToolsBin = Join-Path $SdkRoot "cmdline-tools\latest\bin"
$SdkManager = Join-Path $CommandLineToolsBin "sdkmanager.bat"

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Ensure-AndroidSdk {
    Ensure-Directory $SdkRoot
    Ensure-Directory $DownloadsDir

    if (-not (Test-Path -LiteralPath $SdkManager)) {
        $ZipPath = Join-Path $DownloadsDir "commandlinetools-win.zip"
        $ExtractPath = Join-Path $DownloadsDir "cmdline-tools-extract"
        $LatestPath = Join-Path $SdkRoot "cmdline-tools\latest"

        if (-not (Test-Path -LiteralPath $ZipPath)) {
            $Url = "https://dl.google.com/android/repository/commandlinetools-win-$CommandLineToolsVersion`_latest.zip"
            Invoke-WebRequest -Uri $Url -OutFile $ZipPath
        }

        if (Test-Path -LiteralPath $ExtractPath) {
            Remove-Item -LiteralPath $ExtractPath -Recurse -Force
        }
        Ensure-Directory $ExtractPath
        tar -xf $ZipPath -C $ExtractPath
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $ExtractPath "cmdline-tools"))) {
            throw "Android command-line tools extraction failed."
        }

        if (Test-Path -LiteralPath $LatestPath) {
            Remove-Item -LiteralPath $LatestPath -Recurse -Force
        }
        Ensure-Directory (Split-Path -Parent $LatestPath)
        Move-Item -LiteralPath (Join-Path $ExtractPath "cmdline-tools") -Destination $LatestPath
    }

    $env:ANDROID_SDK_ROOT = $SdkRoot
    $env:ANDROID_HOME = $SdkRoot

    & $SdkManager "--sdk_root=$SdkRoot" "platforms;$PlatformVersion" "build-tools;$BuildToolsVersion"
    if ($LASTEXITCODE -ne 0) {
        throw "Android SDK package installation failed."
    }
}

function Compile-Apk {
    $BuildToolsDir = Join-Path $SdkRoot "build-tools\$BuildToolsVersion"
    $AndroidJar = Join-Path $SdkRoot "platforms\$PlatformVersion\android.jar"
    $Aapt2 = Join-Path $BuildToolsDir "aapt2.exe"
    $D8 = Join-Path $BuildToolsDir "d8.bat"
    $ZipAlign = Join-Path $BuildToolsDir "zipalign.exe"
    $ApkSigner = Join-Path $BuildToolsDir "apksigner.bat"
    $Manifest = Join-Path $ProjectRoot "app\src\main\AndroidManifest.xml"
    $Resources = Join-Path $ProjectRoot "app\src\main\res"
    $JavaSource = Join-Path $ProjectRoot "app\src\main\java\com\envisionchessacademy\lms\MainActivity.java"
    $GeneratedJava = Join-Path $BuildDir "generated"
    $ClassesDir = Join-Path $BuildDir "classes"
    $DexDir = Join-Path $BuildDir "dex"
    $CompiledResources = Join-Path $BuildDir "resources.zip"
    $UnsignedApk = Join-Path $BuildDir "envision-lms-unsigned.apk"
    $DexedApk = Join-Path $BuildDir "envision-lms-dexed.apk"
    $AlignedApk = Join-Path $BuildDir "envision-lms-aligned.apk"
    $FinalApk = Join-Path $OutputDir "envision-lms-debug.apk"
    $Keystore = Join-Path $ProjectRoot "debug.keystore"

    if (Test-Path -LiteralPath $BuildDir) {
        Remove-Item -LiteralPath $BuildDir -Recurse -Force
    }
    Ensure-Directory $BuildDir
    Ensure-Directory $GeneratedJava
    Ensure-Directory $ClassesDir
    Ensure-Directory $DexDir
    Ensure-Directory $OutputDir

    $source = Get-Content -Raw -LiteralPath $JavaSource
    $source = $source -replace 'private static final String APP_URL = ".*?";', "private static final String APP_URL = `"$AppUrl`";"
    Set-Content -LiteralPath $JavaSource -Value $source -NoNewline

    & $Aapt2 compile --dir $Resources -o $CompiledResources
    if ($LASTEXITCODE -ne 0) {
        throw "Resource compilation failed."
    }

    & $Aapt2 link -o $UnsignedApk -I $AndroidJar --manifest $Manifest -R $CompiledResources --java $GeneratedJava --min-sdk-version 23 --target-sdk-version 35 --version-code 1 --version-name "1.0"
    if ($LASTEXITCODE -ne 0) {
        throw "Resource linking failed."
    }

    $JavaFiles = @(Get-ChildItem -Path (Join-Path $ProjectRoot "app\src\main\java") -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
    $GeneratedFiles = @(Get-ChildItem -Path $GeneratedJava -Recurse -Filter "*.java" | ForEach-Object { $_.FullName })
    & javac -source 8 -target 8 -bootclasspath $AndroidJar -d $ClassesDir @JavaFiles @GeneratedFiles
    if ($LASTEXITCODE -ne 0) {
        throw "Java compilation failed."
    }

    & $D8 --lib $AndroidJar --min-api 23 --output $DexDir $ClassesDir
    if ($LASTEXITCODE -ne 0) {
        throw "DEX compilation failed."
    }

    Copy-Item -LiteralPath $UnsignedApk -Destination $DexedApk -Force
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($DexedApk, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        $existing = $zip.GetEntry("classes.dex")
        if ($existing) {
            $existing.Delete()
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $DexDir "classes.dex"), "classes.dex") | Out-Null
    } finally {
        $zip.Dispose()
    }

    & $ZipAlign -f -p 4 $DexedApk $AlignedApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK alignment failed."
    }

    if (-not (Test-Path -LiteralPath $Keystore)) {
        & keytool -genkeypair -v -keystore $Keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
        if ($LASTEXITCODE -ne 0) {
            throw "Debug keystore generation failed."
        }
    }

    & $ApkSigner sign --ks $Keystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out $FinalApk $AlignedApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK signing failed."
    }

    & $ApkSigner verify --verbose $FinalApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK signature verification failed."
    }

    Get-Item -LiteralPath $FinalApk
}

Ensure-AndroidSdk
Compile-Apk
