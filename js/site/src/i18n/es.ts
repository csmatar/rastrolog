import type { Strings } from "./index.ts";

// Spanish copy, written from en.ts (not machine-translated). Same keys and
// placeholders as en.ts; test/i18n.test.ts checks both.
export const es: Strings = {
  meta: {
    title: "rastrolog: mira qué bots de IA leen tu sitio",
    description:
      "Revisa a qué rastreadores de IA deja pasar tu robots.txt y cuenta las visitas que te mandan ChatGPT, Perplexity y otros {others} chats de IA. Gratis, de código abierto y corre en tu navegador.",
  },
  skip: "Saltar al verificador",
  nav: {
    label: "Principal",
    checker: "Verificador",
    logs: "Analizador de logs",
    install: "Instalar",
    github: "GitHub",
    cta: "Revisa tu sitio",
    language: "Idioma",
    menu: "Menú",
  },
  hero: {
    kicker: "código abierto · corre en esta pestaña, no sube nada",
    h1a: "Los bots de IA que leen tu sitio.",
    h1b: "Las visitas que la IA te devuelve.",
    lead: "Pega un dominio para ver a cuáles de los {crawlers} rastreadores de IA deja pasar su robots.txt. Suelta un log de acceso para contar las visitas que te mandaron ChatGPT, Perplexity y otros {others} chats de IA. Las dos herramientas corren en tu navegador.",
  },
  checkerPanel: {
    title: "revisar un sitio",
    files: "robots.txt + llms.txt",
    label: "Dominio",
    button: "Revisar",
    help: "Se consulta directo desde tu navegador. Sin proxy, sin servidor.",
    noscript: "El verificador y el analizador de logs necesitan JavaScript.",
  },
  logPanel: {
    title: "leer un log",
    formats: "nginx · Apache · CloudFront · ALB",
    drop: "Suelta aquí access.log o access.log.gz",
    choose: "Elegir archivo",
    pasteToggle: "o pega líneas",
    pasteLabel: "Líneas del log",
    pasteButton: "Leer estas líneas",
    promise: "Tu archivo nunca sale de tu navegador.",
  },
  stats: {
    label: "Lo que rastrolog conoce",
    crawlers: "rastreadores de IA identificados por nombre",
    companies: "empresas detrás de ellos",
    chats: "chats de IA que detecta como origen de visitas",
    bytes: "bytes de tus datos subidos",
    from: "Rastreadores de",
  },
  checker: {
    h2: "Bloquear GPTBot y otros bots de IA en robots.txt",
    input: {
      empty: "Primero escribe un dominio, como example.com.",
      invalid: "Eso no parece un dominio. Prueba con example.com.",
      ip: "Escribe un nombre de dominio, no una dirección IP.",
      local: "Esa es una dirección local. Prueba con un dominio público, como example.com.",
    },
    checking: "Revisando {host}…",
    ready: "Reporte listo para {host}.",
    again: "Revisar otro sitio",
    robots: {
      found: {
        one: "robots.txt · {status} · 1 línea",
        other: "robots.txt · {status} · {n} líneas",
      },
      pasted: { one: "robots.txt · pegado · 1 línea", other: "robots.txt · pegado · {n} líneas" },
      missing: "robots.txt · {status} · no existe, así que todos los rastreadores tienen permiso",
      unavailable:
        "robots.txt · {status} · los rastreadores lo tratan como si no existiera, así que todo está permitido",
      html: "robots.txt · {status} · respondió una página web, así que no aplica ninguna regla",
    },
    llms: {
      found: "llms.txt · {status} · «{title}» · {links}",
      foundUntitled: "llms.txt · {status} · {links}",
      pasted: "llms.txt · pegado · {links}",
      links: { one: "1 enlace", other: "{n} enlaces" },
      missing: "Sin llms.txt",
      unreachable: "llms.txt · no se pudo leer desde el navegador",
      pasteSummary: "Pegar llms.txt",
      pasteLabel: "Contenido de llms.txt",
      pasteButton: "Leer llms.txt",
    },
    checkedAt: "revisado ahora mismo, desde tu navegador",
    headline: "{host} deja pasar a {allowed} de {total} rastreadores de IA.",
    blockedEverywhere: {
      one: "1 está bloqueado en todo el sitio",
      other: "{n} están bloqueados en todo el sitio",
    },
    blockedSome: {
      one: "1 está bloqueado en algunas páginas",
      other: "{n} están bloqueados en algunas páginas",
    },
    subBoth: "{blocked} y {some}.",
    subOne: "{part}.",
    subNone: "Ninguno está bloqueado.",
    summary: {
      training: {
        blocked: {
          one: "{vendors} no puede recolectar datos de entrenamiento de {host}.",
          other: "{vendors} no pueden recolectar datos de entrenamiento de {host}.",
        },
        partial: {
          one: "{vendors} puede recolectar datos de entrenamiento solo de algunas páginas.",
          other: "{vendors} pueden recolectar datos de entrenamiento solo de algunas páginas.",
        },
        allowed: {
          one: "{vendors} puede recolectar datos de entrenamiento.",
          other: "{vendors} pueden recolectar datos de entrenamiento.",
        },
        all: "Todas las empresas de IA de la lista pueden recolectar datos de entrenamiento de {host}.",
        none: "Ninguna empresa de IA de la lista puede recolectar datos de entrenamiento de {host}.",
      },
      user_fetch: {
        blocked: {
          one: "{vendors} no puede abrir páginas cuando alguien se lo pide.",
          other: "{vendors} no pueden abrir páginas cuando alguien se lo pide.",
        },
        partial: {
          one: "{vendors} puede abrir solo algunas páginas cuando alguien se lo pide.",
          other: "{vendors} pueden abrir solo algunas páginas cuando alguien se lo pide.",
        },
        allowed: {
          one: "{vendors} puede abrir páginas cuando alguien se lo pide.",
          other: "{vendors} pueden abrir páginas cuando alguien se lo pide.",
        },
        all: "Todos los asistentes de IA pueden abrir una página cuando alguien se lo pide.",
        none: "Ningún asistente de IA puede abrir una página cuando alguien se lo pide.",
      },
      search_index: {
        blocked: {
          one: "{vendors} no puede indexar {host} para búsquedas.",
          other: "{vendors} no pueden indexar {host} para búsquedas.",
        },
        partial: {
          one: "{vendors} puede indexar solo algunas páginas.",
          other: "{vendors} pueden indexar solo algunas páginas.",
        },
        allowed: {
          one: "{vendors} puede indexar {host}.",
          other: "{vendors} pueden indexar {host}.",
        },
        all: "Todos los rastreadores de búsqueda de la lista pueden indexar {host}.",
        none: "Ningún rastreador de búsqueda de la lista puede indexar {host}.",
      },
    },
    purposes: {
      training: { label: "entrenamiento", hint: "rastrea para entrenar modelos de IA" },
      user_fetch: {
        label: "consulta de usuario",
        hint: "abre una página cuando alguien se lo pide a un asistente",
      },
      search_index: {
        label: "índice de búsqueda",
        hint: "indexa páginas para respuestas de búsqueda con IA",
      },
    },
    counts: {
      blocked: { one: "1 bloqueado", other: "{n} bloqueados" },
      partial: { one: "1 parcial", other: "{n} parciales" },
      allowed: { one: "1 permitido", other: "{n} permitidos" },
    },
    verdicts: { allowed: "permitido", blocked: "bloqueado", partial: "parcial" },
    columns: {
      verdict: "Veredicto",
      token: "Token",
      vendor: "Empresa",
      lines: "Líneas que aplican",
    },
    noRule: "ninguna regla aplica, así que está permitido",
    cors: "{host} no deja que otros sitios lean su robots.txt desde el navegador, así que no podemos traerlo desde aquí. Ábrelo y pega su contenido abajo; haremos la misma revisión.",
    serverError:
      "{host}/robots.txt respondió {status}. Ante un error del servidor, los rastreadores asumen que todo está bloqueado hasta que se recupere. Si puedes abrir el archivo, pégalo abajo para revisar sus reglas.",
    openFile: "Abrir {url}",
    pasteLabel: "Contenido de robots.txt",
    pasteButton: "Revisar el texto pegado",
  },
  logs: {
    h2: "Tráfico desde ChatGPT en tus logs",
    reading: "Leyendo {name} en tu navegador",
    progress: "{read} de {total} MB",
    progressUnknown: "{read} MB leídos",
    cancel: "Cancelar",
    cancelled: "Detenido. No se guardó nada del archivo.",
    meta: "{name} · {format} · {lines} · {skipped} · leído en este dispositivo",
    lines: { one: "1 línea", other: "{n} líneas" },
    skipped: { one: "1 omitida", other: "{n} omitidas" },
    formats: { combined: "nginx/Apache combined", cloudfront: "CloudFront", alb: "AWS ALB" },
    crawlerVisits: {
      one: "visita de rastreadores de IA.",
      other: "visitas de rastreadores de IA.",
    },
    chatVisits: {
      one: "persona llegó desde chats de IA.",
      other: "personas llegaron desde chats de IA.",
    },
    crawlersTitle: "Rastreadores de IA",
    referralsTitle: "Visitas desde chats de IA",
    searchTitle: "Buscadores, para comparar",
    searchNote:
      "No cuentan como tráfico de IA. Las AI Overviews de Google mandan un referer simple de google.com, así que se ven como búsqueda.",
    columns: {
      vendor: "Empresa",
      token: "Token",
      purpose: "Propósito",
      requests: "Solicitudes",
      pages: "Páginas",
      lastSeen: "Última vez (UTC)",
      topPages: "Páginas principales",
      product: "Producto",
      visits: "Visitas",
      landing: "Páginas de llegada",
    },
    requests: { one: "1 solicitud", other: "{n} solicitudes" },
    noAi: "Este log no tiene rastreadores de IA ni visitas desde chats de IA.",
    truncated:
      "El archivo termina antes de tiempo (un gzip cortado o dañado). Estos números cubren todas las líneas completas hasta ese punto.",
    unknown: "rastrolog no reconoce el formato de este log. Esta es la primera línea:",
    formatLabel: "Leerlo como",
    formatButton: "Intentar de nuevo",
    failed: "No se pudo leer este archivo: {message}",
    workerFailed: "el lector se detuvo de forma inesperada",
    pasteName: "líneas pegadas",
  },
  ask: {
    email: "Correo",
    placeholder: "tu@empresa.com",
    latam: "Desarrollo software para negocios en México o LATAM.",
    submitting: "Enviando…",
    error: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo; tu correo sigue aquí.",
    checker: {
      title: "¿Quieres este reporte en tu correo?",
      bodyOpen:
        "El robots.txt de {host} menciona {named} de los {total} rastreadores de IA que rastrolog conoce, así que el próximo que lance alguna empresa entra sin pedir permiso.",
      bodyClosed:
        "El robots.txt de {host} menciona {named} de los {total} rastreadores de IA que rastrolog conoce. El próximo que lance alguna empresa caerá en sus reglas de User-agent: *.",
      bodyNone:
        "{host} no tiene robots.txt, así que cualquier rastreador de IA puede leer todo el sitio, incluido el próximo que lance alguna empresa.",
      tail: "Te mandamos ahora un enlace a este reporte y, después, un aviso corto cada vez que se agregue un rastreador, con las líneas para pegar en robots.txt.",
      button: "Mándame el reporte",
      fine: "Tu correo y {host} se envían a Kit, nuestro servicio de correo. Primero confirmas por correo, y te das de baja con un clic.",
      sentTitle: "Revisa tu correo",
      sentBody:
        "Confirma {email} y el enlace a este reporte va en camino. El enlace vuelve a correr la revisión, así que no guardamos nada sobre el sitio.",
      linkLabel: "Tu enlace al reporte:",
    },
    log: {
      title: "Entérate del próximo rastreador antes de que aparezca aquí",
      body: {
        one: "1 rastreador de IA leyó este sitio. Cuando una empresa agregue otro, te llega un correo con su nombre, qué hace y las líneas de robots.txt para bloquearlo.",
        other:
          "{n} rastreadores de IA leyeron este sitio. Cuando una empresa agregue otro, te llega un correo con su nombre, qué hace y las líneas de robots.txt para bloquearlo.",
      },
      bodyNone:
        "Todavía no aparece ningún rastreador de IA en este log. Cuando una empresa lance uno nuevo, te llega un correo con su nombre, qué hace y las líneas de robots.txt para bloquearlo.",
      button: "Mándame avisos",
      fine: "Solo tu correo se envía a Kit, nuestro servicio de correo. El log se queda en esta pestaña.",
      sentTitle: "Revisa tu correo",
      sentBody:
        "Confirma {email} para empezar a recibir avisos de rastreadores. Tu log nunca salió de esta pestaña.",
    },
  },
  install: {
    h2: "Sigue contando después de cerrar esta pestaña",
    pythonTitle: "Tus logs de servidor · Python 3.10+",
    pythonBody: "El mismo reporte en tu terminal, más middleware para FastAPI y Django.",
    snippetTitle: "Tus páginas · una etiqueta script, menos de 2 KB",
    snippetBefore: "Envía un evento",
    snippetAfter: "a GA4, Plausible, PostHog, Fathom, Umami, Matomo o Tag Manager.",
    pinned: "Etiqueta siempre al día y más opciones",
    copy: "Copiar",
    copied: "Copiado",
  },
  detects: {
    h2: "Qué detecta",
    body: "{crawlers} tokens de rastreadores y {chats} productos de IA. {documented} de los tokens vienen de la documentación de cada empresa, y la lista es abierta:",
    listLink: "signals.json",
    caption: "Tokens de rastreadores por empresa, cada uno con enlace a su documentación",
    vendorCol: "Empresa",
    tokensCol: "Tokens de rastreadores",
    thirdParty: "fuente externa",
    referrers: "Chats de IA como origen",
  },
  media: {
    h2: "Para leer y ver",
    play: "Ver el video (carga YouTube)",
    videoTitle: "Video de rastrolog",
  },
  signup: {
    kicker: "$ avisos de rastrolog",
    h2: "Un correo cuando una empresa de IA lance un rastreador nuevo",
    body: "Cuando una empresa agrega o renombra un rastreador, recibes su nombre, qué hace con tus páginas y las líneas exactas de robots.txt para bloquearlo. Eso es todo el boletín.",
    button: "Mándame avisos",
    fine: "Primero confirmas por correo. Te das de baja con un clic.",
    sentTitle: "Revisa tu correo",
    sentBody: "Confirma {email} para empezar a recibir avisos de rastreadores.",
    sample: {
      label: "Aviso de ejemplo",
      note: "de un rastreador que ya está en la lista",
      from: "De rastrolog",
      subject: "Nuevo rastreador de IA: {token}",
      body: "{vendor} lo usa para recolectar páginas y entrenar sus modelos.",
      docs: "Documentación de {vendor}",
      block: "Para bloquearlo, agrega estas líneas a robots.txt:",
    },
  },
  footer: {
    license: "rastrolog · MIT",
    analytics:
      "Sin cookies. Cloudflare Web Analytics cuenta las visitas, y el snippet de rastrolog también corre aquí.",
  },
};
