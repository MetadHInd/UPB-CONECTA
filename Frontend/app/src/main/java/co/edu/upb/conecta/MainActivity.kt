package co.edu.upb.conecta

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import co.edu.upb.conecta.ui.navigation.UPBConectaNavHost
import co.edu.upb.conecta.ui.theme.UPBConectaTheme

/**
 * Punto de entrada de la app. Análogo, en espíritu, a `src/main.ts` del
 * backend: aquí se compone el árbol de UI raíz, pero el enrutamiento de
 * pantallas vive en `ui/navigation/NavGraph.kt`.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            UPBConectaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    UPBConectaNavHost()
                }
            }
        }
    }
}
