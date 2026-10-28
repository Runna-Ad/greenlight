# Auditoría del flujo de cambios y comentarios (2026-10-27)

5 agentes (base de datos en PGlite, acciones del servidor, portal del cliente, lado del equipo, avisos y correos), sobre main ffd5ed7. Nada tocó la base real. "Verificado" = lo revisé yo en el código o el agente lo reprodujo en PGlite.

## SERIOS (verificados)

1. **"Aprobar" se salta el bloqueo de conversación abierta.** `approveTask` (tablero/actions.ts:221) no llama a `bloqueoEnvioPieza`; `rpc_task_approve` (0038:54) resuelve TODOS los cambios del cliente, incluso con el cliente esperando respuesta. Camino: lead pasa al especialista → especialista devuelve → lead Aprueba → Enviar a cliente → el cliente ve "Aplicado".
2. **Una nota interna deja al lead sin poder contestarle al cliente.** correcciones-actions.ts:296 lee la última respuesta de CUALQUIER tipo; tras una nota interna, `ultimaDeCliente` es false y la respuesta del lead va al equipo. El letrero y el bloqueo siguen diciendo "el cliente contestó". Arreglo: leer sólo la última visible (`de_cliente or para_cliente`), igual en panel.tsx.
3. **El especialista puede reabrir lo que el lead ya cerró.** `setEstadoCorreccion` (correcciones-actions.ts:116) sólo pide lead para "closed"; "open"/"done" sobre un cambio confirmado o "sin cambio" pasa y borra la decisión del lead.
4. **La respuesta del cliente en un cambio ya aplicado se pierde.** portal-actions.ts:184 no revisa `resolved_at`; la caja de respuesta sale en tarjetas Aplicado/Sin cambio; ni la etiqueta de Mi trabajo ni el bloqueo cuentan cambios cerrados.
5. **Respuesta del cliente en una tarea sin lead asignado → nadie se entera.** 0083:153 sólo avisa a `es_lead` + quien ya le contestó. PGlite: 0 avisos.
6. **"Te respondieron" en cambios ya cerrados (portal).** portal-data.ts:216 no filtra `resolved_at is null`; panel-control-cambios.tsx:202 no excluye `estado === "closed"`.
7. **"¡Aprobado!" desde una pestaña vieja sin aprobar nada.** `rpc_client_approve` (0036:56) inserta el comentario y avisa al equipo aunque la tarea ya no esté en published; no lanza error.
8. **Carrera al enviar la pieza.** El bloqueo vive en la app (tablero/actions.ts:438-465); `rpc_lead_reenvia_cliente` no vuelve a revisar ni bloquea filas. Si el cliente responde en ese segundo, el cambio queda "Aplicado".
9. **Borrar un plano borra sus cambios del cliente y todo el hilo.** Trigger `trg_borrar_correcciones_huerfanas` (0039:29) + cascade de 0082. PGlite: 1 cambio + 2 respuestas → 0; la tarea queda en in_corrections sin nada.
10. **`rpc_lead_reenvia_cliente` no revisa que quien llama sea lead.** Con el rol del servidor acepta a un creativo como actor (PGlite). Hoy sólo lo protege la app.
11. **Confirmar desde el campo en un borrador.** campo-correcciones.tsx:62 muestra "Confirmar" en cambios "Por enviar"; `confirmarCampo` no revisa borrador y cierra cambios con conversación abierta.
12. **Borrar con un clic en Vista cliente.** campo-lectura.tsx:565: la X borra el cambio del cliente y su hilo sin confirmar (el panel sí confirma).
13. **Portal: tarjeta del brief dice "Al día"** con una respuesta del equipo esperando (portal-home.tsx:208).

## MENORES
- Lead no puede dejar nota interna mientras el cambio está en su cancha (todo va al cliente): decisión de diseño.
- Respuesta interna del lead avisa al especialista aunque la tarea siga en la cancha del lead (0083).
- Texto "El lead aplicó los cambios" aunque todo fue sin cambio (conocido).
- Correos agrupados esperan sin fin si nadie usa la app (falta instalar el reloj 0084).
- Liga del correo "pieza reenviada" lleva al inicio del portal, no a la tarea (0061).
- Correo a un miembro desactivado durante la espera de 10 min sale igual.
- Gris neutral: "En producción" #5a6478 (portal-home.tsx:25), respuestas internas sin color (hilo-respuestas.tsx:123).
- "Sin cambio" en verde en campo-lectura.tsx:316 (en el panel es azul); ronda previa abierta en verde (panel.tsx:164).
- Aplicado y Aprobado usan el mismo turquesa.
- Rondas viejas colapsadas esconden un "Te respondieron"/"El cliente respondió".
- Respuesta larga sin espacios puede desbordar la tarjeta.
- Consultas sin paginar (cambios-pendientes.ts:65, tablero/actions.ts:448) y error de Supabase ignorado en cambios-pendientes.ts:26.
- descartarCorreccion dice ok aunque no borró nada.
- Política vieja `comments_client` (0002) dejaría leer comentarios internos si algún día se vuelve a abrir el esquema a `authenticated` (hoy cerrado).

## Lo que pasó bien
Respuestas internas nunca llegan al cliente (portal, RPC y avisos). Un cliente de otra marca queda fuera. Nadie se avisa a sí mismo. El banner "enviar pieza" y el servidor usan la misma regla. Las rondas numeran bien. El CHECK de sin_cambio aguanta. Rol `authenticated` sin acceso al esquema.
