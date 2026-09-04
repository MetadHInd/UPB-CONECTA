package co.edu.upb.conecta.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import co.edu.upb.conecta.data.repository.AppContainer
import co.edu.upb.conecta.ui.screens.chatbot.ChatbotScreen
import co.edu.upb.conecta.ui.screens.detalle.ConvocatoriaDetalleScreen
import co.edu.upb.conecta.ui.screens.detalle.PracticaDetalleScreen
import co.edu.upb.conecta.ui.screens.foro.ForoDetalleScreen
import co.edu.upb.conecta.ui.screens.foro.ForoScreen
import co.edu.upb.conecta.ui.screens.inicio.InicioScreen
import co.edu.upb.conecta.ui.screens.login.LoginScreen
import co.edu.upb.conecta.ui.screens.mapa.MapaScreen
import co.edu.upb.conecta.ui.screens.noticias.NoticiasScreen
import co.edu.upb.conecta.ui.screens.notificaciones.NotificacionesScreen
import co.edu.upb.conecta.ui.screens.perfil.PerfilScreen
import co.edu.upb.conecta.ui.screens.splash.SplashScreen
import co.edu.upb.conecta.ui.theme.UpbGradienteMarca

private val rutasConBarraInferior = destinosBarraInferior.map { it.ruta }.toSet()
private val rutasConFabChatbot = setOf(Rutas.INICIO, Rutas.NOTICIAS, Rutas.FORO)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UPBConectaNavHost() {
    val navController: NavHostController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val rutaActual = backStackEntry?.destination?.route

    val esPantallaPrincipal = rutaActual in rutasConBarraInferior

    Scaffold(
        topBar = {
            if (esPantallaPrincipal) {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "UPB",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.ExtraBold,
                                style = TextStyle(brush = UpbGradienteMarca)
                            )
                            Text(
                                text = " Conecta",
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        actionIconContentColor = MaterialTheme.colorScheme.onSurface
                    ),
                    actions = {
                        IconButton(onClick = { navController.navigate(Rutas.NOTIFICACIONES) }) {
                            Icon(Icons.Filled.Notifications, contentDescription = "Notificaciones")
                        }
                    }
                )
            }
        },
        bottomBar = {
            if (rutaActual in rutasConBarraInferior) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    destinosBarraInferior.forEach { destino ->
                        NavigationBarItem(
                            selected = rutaActual == destino.ruta,
                            onClick = {
                                navController.navigate(destino.ruta) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(destino.icono, contentDescription = destino.etiqueta) },
                            label = { Text(destino.etiqueta) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                                unselectedTextColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (rutaActual in rutasConFabChatbot) {
                // Botón flotante con el degradado de marca — Material3 no
                // acepta un Brush directamente en FloatingActionButton, así
                // que se arma a mano con un Box circular.
                Box(
                    modifier = Modifier
                        .shadow(6.dp, CircleShape)
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(UpbGradienteMarca)
                        .clickable { navController.navigate(Rutas.CHATBOT) },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Filled.Chat,
                        contentDescription = "Chatbot de preguntas frecuentes",
                        tint = Color.White
                    )
                }
            }
        }
    ) { paddingInterno ->
        NavHost(
            navController = navController,
            startDestination = Rutas.SPLASH,
            modifier = Modifier.padding(paddingInterno)
        ) {
            composable(Rutas.SPLASH) {
                SplashScreen(
                    onTerminar = {
                        navController.navigate(Rutas.LOGIN) {
                            popUpTo(Rutas.SPLASH) { inclusive = true }
                        }
                    }
                )
            }
            composable(Rutas.LOGIN) {
                LoginScreen(
                    authRepository = AppContainer.authRepository,
                    onLoginExitoso = {
                        navController.navigate(Rutas.INICIO) {
                            popUpTo(Rutas.LOGIN) { inclusive = true }
                        }
                    }
                )
            }
            composable(Rutas.INICIO) {
                InicioScreen(
                    convocatoriasRepository = AppContainer.convocatoriasRepository,
                    practicasRepository = AppContainer.practicasRepository,
                    onAbrirConvocatoria = { id -> navController.navigate(Rutas.convocatoriaDetalle(id)) },
                    onAbrirPractica = { id -> navController.navigate(Rutas.practicaDetalle(id)) }
                )
            }
            composable(Rutas.NOTICIAS) {
                NoticiasScreen(noticiasRepository = AppContainer.noticiasRepository)
            }
            composable(Rutas.FORO) {
                ForoScreen(
                    foroRepository = AppContainer.foroRepository,
                    onAbrirPost = { id -> navController.navigate(Rutas.foroDetalle(id)) }
                )
            }
            composable(Rutas.MAPA) {
                MapaScreen(mapaRepository = AppContainer.mapaRepository)
            }
            composable(Rutas.PERFIL) {
                PerfilScreen(
                    usuarioRepository = AppContainer.usuarioRepository,
                    onCerrarSesion = {
                        navController.navigate(Rutas.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }
            composable(
                route = Rutas.CONVOCATORIA_DETALLE,
                arguments = listOf(navArgument("id") { type = NavType.StringType })
            ) { entrada ->
                val id = entrada.arguments?.getString("id").orEmpty()
                ConvocatoriaDetalleScreen(
                    id = id,
                    convocatoriasRepository = AppContainer.convocatoriasRepository,
                    onVolver = { navController.popBackStack() }
                )
            }
            composable(
                route = Rutas.PRACTICA_DETALLE,
                arguments = listOf(navArgument("id") { type = NavType.StringType })
            ) { entrada ->
                val id = entrada.arguments?.getString("id").orEmpty()
                PracticaDetalleScreen(
                    id = id,
                    practicasRepository = AppContainer.practicasRepository,
                    onVolver = { navController.popBackStack() }
                )
            }
            composable(
                route = Rutas.FORO_DETALLE,
                arguments = listOf(navArgument("id") { type = NavType.StringType })
            ) { entrada ->
                val id = entrada.arguments?.getString("id").orEmpty()
                ForoDetalleScreen(
                    id = id,
                    foroRepository = AppContainer.foroRepository,
                    onVolver = { navController.popBackStack() }
                )
            }
            composable(Rutas.NOTIFICACIONES) {
                NotificacionesScreen(
                    notificacionesRepository = AppContainer.notificacionesRepository,
                    onVolver = { navController.popBackStack() }
                )
            }
            composable(Rutas.CHATBOT) {
                ChatbotScreen(
                    chatbotRepository = AppContainer.chatbotRepository,
                    onVolver = { navController.popBackStack() }
                )
            }
        }
    }
}
