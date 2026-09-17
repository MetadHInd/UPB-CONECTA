# Contexto de identidad

## Propósito

Este contexto atiende la HU-43: autenticación de estudiantes contra el directorio institucional.

La política del backend es explícita:

- no se guarda la contraseña del estudiante en ningún repositorio local;
- no se crea una integración "real" falsa con directorio institucional;
- se expone una capa de puertos para adaptar LDAP, OAuth o un proveedor institucional real cuando exista la infraestructura externa;
- la autenticación debe devolver mensajes genéricos para evitar filtrar si el usuario o la contraseña son incorrectos;
- se aplica rate limiting para evitar fuerza bruta.

## Puertos y adaptadores

### Dominio

- `IdentityProviderPort`: contrato del proveedor de autenticación.
- `RateLimiterPort`: contrato para controlar intentos fallidos repetidos.
- `AuthenticationResult`: resultado de la autenticación con estados `ok: true` o `ok: false`.

### Aplicación

- `AuthenticateStudent`: caso de uso principal para validar credenciales y devolver un resultado seguro al cliente.

### Infraestructura

- `InMemoryIdentityProviderAdapter`: adaptación local para pruebas y entorno sin proveedor externo real.
- `RealIdentityProviderAdapter`: adaptador que falla explícitamente hasta que exista configuración real del directorio institucional.
- `InMemoryRateLimiter`: limitador en memoria con ventana configurable por variables de entorno.

## Variables de entorno soportadas

- `IDENTITY_RATE_LIMIT_WINDOW_MS`: duración de la ventana para contar fallidos.
- `IDENTITY_RATE_LIMIT_MAX_PER_ACCOUNT`: máximo de intentos fallidos por cuenta.
- `IDENTITY_RATE_LIMIT_MAX_PER_ORIGIN`: máximo de intentos fallidos por origen.

Valores por defecto:

- `windowMs`: 60000 ms
- `maxAttemptsPerAccount`: 5
- `maxAttemptsPerOrigin`: 10

## Reglas de seguridad

1. La contraseña nunca se persiste en claro.
2. Si el directorio institucional no está disponible, el cliente recibe un mensaje genérico de indisponibilidad.
3. Si las credenciales son inválidas, el cliente recibe únicamente: "Credenciales inválidas."
4. Si el usuario supera el número de intentos, se devuelve un error de rate limit.
5. El almacenamiento de tokens/certificados sensibles queda fuera del backend y corresponde al lado de Android con Keystore.

## Riesgo de integración

La integración con el directorio real no se implementa como un 'stub realista' ni se oculta bajo mocks. Se declara como un adaptador que falla con un error explícito hasta que haya un proveedor institucional real y configurado.
