import { useState } from 'react';
import { ArrowUpRight, Globe2, Layers3 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   СЕРВИСЫ ДИО КОНСАЛТА
   ═══════════════════════════════════════════════════════════════════ */

interface CompanyService {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string;
  category: string;
  external?: boolean;
}

const SERVICES: CompanyService[] = [
  {
    id: 'dios-consult',
    title: 'ДИО Консалт',
    description: 'Официальный сайт компании',
    url: 'http://80.93.62.177:8000/',
    image: '/images/services/dios-consult.jpg',
    category: 'Компания',
    external: true,
  },
  {
    id: 'dios-service',
    title: 'DIO Desk',
    description: 'Управление заявками, проектами и технической поддержкой',
    url: 'http://10.1.50.109:3001/dashboard',
    image: '/images/services/dios-service.jpg',
    category: 'Сервис',
    external: true,
  },

  /*
   * Новые сервисы добавляются сюда.
   *
   * {
   *   id: 'dios-ai',
   *   title: 'ДИО AI',
   *   description: 'Корпоративный ИИ-ассистент',
   *   url: 'https://...',
   *   image: '/images/services/dios-ai.jpg',
   *   category: 'Искусственный интеллект',
   *   external: true,
   * },
   */
];

/* ═══════════════════════════════════════════════════════════════════
   SERVICE CARD
   ═══════════════════════════════════════════════════════════════════ */

function ServiceCard({
  service,
  index,
}: {
  service: CompanyService;
  index: number;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const hasImage = imageLoaded && !imageError;

  return (
    <a
      href={service.url}
      target={service.external ? '_blank' : undefined}
      rel={service.external ? 'noopener noreferrer' : undefined}
      className="
        group
        relative
        block
        min-h-[300px]
        sm:min-h-[340px]
        lg:min-h-[380px]
        overflow-hidden
        rounded-2xl
        border border-[var(--border-color)]
        bg-[var(--bg-card)]
        transition-all duration-300
        hover:border-[var(--border-hover)]
        hover:-translate-y-1
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-[var(--accent)]
      "
      style={{
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* ФОНОВАЯ ФОТОГРАФИЯ */}
      <img
        src={service.image}
        alt=""
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
        className={`
          absolute inset-0
          w-full h-full
          object-cover
          transition-all duration-700
          group-hover:scale-[1.04]

          ${
            hasImage
              ? 'opacity-100'
              : 'opacity-0'
          }
        `}
      />

      {/* ФОН, ЕСЛИ ИЗОБРАЖЕНИЕ НЕ ЗАГРУЖЕНО */}
      {!hasImage && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--hover-2)] via-[var(--bg-card)] to-[var(--hover-1)]">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04]">
            <Globe2 className="w-48 h-48 text-[var(--text-primary)]" />
          </div>
        </div>
      )}

      {/* ЗАТЕМНЕНИЕ ФОТОГРАФИИ */}
      <div
        className="
          absolute inset-0
          bg-gradient-to-t
          from-black/90
          via-black/35
          to-black/10
          transition-colors duration-300
          group-hover:from-black/95
        "
      />

      {/* ВЕРХНИЙ БЛОК */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-start justify-between gap-4">
        {/* КАТЕГОРИЯ */}
        <span
          className="
            inline-flex items-center
            px-3 py-1.5
            rounded-lg
            border border-white/15
            bg-black/25
            backdrop-blur-md
            text-xs font-medium
            text-white/75
          "
        >
          {service.category}
        </span>

        {/* ИКОНКА ПЕРЕХОДА */}
        <div
          className="
            w-11 h-11
            rounded-xl
            border border-white/20
            bg-white/10
            backdrop-blur-md
            flex items-center justify-center
            text-white
            transition-all duration-300
            group-hover:bg-white
            group-hover:text-black
          "
        >
          <ArrowUpRight
            className="
              w-5 h-5
              transition-transform duration-300
              group-hover:translate-x-0.5
              group-hover:-translate-y-0.5
            "
          />
        </div>
      </div>

      {/* НИЖНИЙ БЛОК */}
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-7">
        <h2
          className="
            text-3xl
            sm:text-4xl
            font-bold
            tracking-tight
            text-white
          "
        >
          {service.title}
        </h2>

        <p
          className="
            mt-3
            max-w-md
            text-base
            leading-relaxed
            text-white/65
          "
        >
          {service.description}
        </p>

        {/* ЛИНИЯ ПРИ НАВЕДЕНИИ */}
        <div className="mt-6 h-px w-full bg-white/15 overflow-hidden">
          <div
            className="
              h-full w-0
              bg-white
              transition-all duration-500
              group-hover:w-full
            "
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-white/55 group-hover:text-white/85 transition-colors">
            Перейти к сервису
          </span>

          <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
        </div>
      </div>
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function GlobalPage() {
  return (
    <div className="w-full max-w-[1600px] mx-auto pb-16 animate-in fade-in duration-500">

      {/* =========================================================
          HEADER
      ========================================================= */}
      <div className="mb-10">

        {/* БРЕНД */}
        <div className="flex items-center gap-2.5 mb-5">
          <div
            className="
              w-9 h-9
              rounded-xl
              bg-[var(--accent)]/10
              flex items-center justify-center
            "
          >
            <Layers3 className="w-5 h-5 text-[var(--accent)]" />
          </div>

          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]/50">
            ДИО Консалт
          </span>
        </div>

        {/* ЗАГОЛОВОК */}
        <h1
          className="
            text-3xl
            sm:text-4xl
            lg:text-5xl
            font-bold
            tracking-tight
            text-[var(--text-primary)]
          "
        >
          Наши сервисы
        </h1>

        <p
          className="
            mt-4
            max-w-2xl
            text-base
            sm:text-lg
            leading-relaxed
            text-[var(--text-primary)]/50
          "
        >
          Единое пространство цифровых продуктов и сервисов
          компании ДИО Консалт.
        </p>
      </div>

      {/* =========================================================
          SERVICES
      ========================================================= */}
      <section
        aria-label="Сервисы компании"
        className="
          grid
          grid-cols-1
          lg:grid-cols-2
          gap-5
          lg:gap-6
        "
      >
        {SERVICES.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            index={index}
          />
        ))}
      </section>

      {/* =========================================================
          FOOTER
      ========================================================= */}
      <div
        className="
          mt-10
          pt-6
          border-t border-[var(--border-color)]
          flex flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
        "
      >
        <p className="text-sm text-[var(--text-primary)]/35">
          ДИО Консалт · Цифровые сервисы компании
        </p>

        <span className="text-sm text-[var(--text-primary)]/35">
          {SERVICES.length} сервиса
        </span>
      </div>
    </div>
  );
}