$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*PrimeTek Studio*" } | Select-Object -First 1
if (-not $cert) {
    Write-Host "Creating new Code Signing Certificate for PrimeTek Studio..."
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=PrimeTek Studio" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)
}

Write-Host "Signing ConverterStudio.exe..."
Set-AuthenticodeSignature -FilePath "ConverterStudio.exe" -Certificate $cert

Write-Host "Signing ConverterStudio_Setup_v2.6.12.exe..."
Set-AuthenticodeSignature -FilePath "dist_installer\ConverterStudio_Setup_v2.6.12.exe" -Certificate $cert

Write-Host "Exporting Public Certificate..."
Export-Certificate -Cert $cert -FilePath "dist_installer\PrimeTek_Certificate.cer"

Write-Host "Done!"
