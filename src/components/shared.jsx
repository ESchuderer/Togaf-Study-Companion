import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import {t, href} from '../model';

export function PageHeading({eyebrow, title, children, action}) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{t(eyebrow)}</p>}<h1>{t(title)}</h1>{children && <p className="lede">{children}</p>}</div>{action}</div>;
}
export function LinkButton({to, children, variant='default', ...props}) {
  return <Button asChild variant={variant} {...props}><a href={href(to)}>{children}</a></Button>;
}
export function Notice({children, error=false}) {
  return <div className={error?'notice error':'notice'} role={error?'alert':'status'}>{children}</div>;
}
export function Metric({label, value, detail, icon:Icon}) {
  return <Card className="metric"><CardContent><div className="metric-label">{t(label)}{Icon && <Icon size={17} aria-hidden="true"/>}</div><strong>{value}</strong>{detail && <p>{detail}</p>}</CardContent></Card>;
}
export function Check({children, ...props}) {
  return <label className="check"><input type="checkbox" {...props}/><span>{children}</span></label>;
}
export function Field({label, id, children}) {
  return <div className="field"><label htmlFor={id}>{t(label)}</label>{children}</div>;
}
