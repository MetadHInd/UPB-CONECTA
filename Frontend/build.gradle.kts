// Root build file. Declara los plugins usados por los módulos pero no los aplica aquí
// (cada módulo los aplica según necesite) — patrón estándar de un proyecto Android moderno.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
