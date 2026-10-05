import { ReactNode } from 'react'
import { Breadcrumbs } from './Breadcrumbs'

interface PageHeroProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHero({ title, subtitle, actions }: PageHeroProps) {
  return (
    <header className="hb-page-head">
      <div>
        <Breadcrumbs />
        <h1 className="hb-page-head__title">{title}</h1>
        {subtitle && <p className="hb-page-head__sub">{subtitle}</p>}
      </div>
      {actions && <div className="hb-page-head__actions">{actions}</div>}
    </header>
  )
}
