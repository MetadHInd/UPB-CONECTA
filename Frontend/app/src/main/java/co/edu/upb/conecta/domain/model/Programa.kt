package co.edu.upb.conecta.domain.model

/**
 * Programa académico de la UPB Seccional Bucaramanga.
 *
 * La lista de [MockProgramas] es ilustrativa para este front preliminar;
 * debe reemplazarse por el listado oficial de programas cuando se integre
 * con el backend (probablemente un endpoint de catálogo).
 */
data class Programa(
    val id: String,
    val nombre: String,
    val facultad: String
)

object MockProgramas {
    val TODOS = Programa(id = "todos", nombre = "Todos los programas", facultad = "General")

    val sistemas = Programa("sistemas", "Ingeniería de Sistemas e Informática", "Ingenierías")
    val industrial = Programa("industrial", "Ingeniería Industrial", "Ingenierías")
    val civil = Programa("civil", "Ingeniería Civil", "Ingenierías")
    val electronica = Programa("electronica", "Ingeniería Electrónica", "Ingenierías")
    val administracion = Programa("administracion", "Administración de Empresas", "Ciencias Económicas")
    val contaduria = Programa("contaduria", "Contaduría Pública", "Ciencias Económicas")
    val derecho = Programa("derecho", "Derecho", "Ciencias Jurídicas")
    val psicologia = Programa("psicologia", "Psicología", "Ciencias Sociales")
    val comunicacion = Programa("comunicacion", "Comunicación Social - Periodismo", "Ciencias Sociales")

    val todos: List<Programa> = listOf(
        sistemas, industrial, civil, electronica,
        administracion, contaduria, derecho, psicologia, comunicacion
    )
}
