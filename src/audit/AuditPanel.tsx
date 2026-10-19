import { Activity, CheckCircle2, CircleAlert, CircleHelp, FileCheck2, FileSearch, ShieldAlert } from 'lucide-react';
import type { AuditReport, AuditCheck } from './core';
import './audit.css';

function iconFor(result: AuditCheck['result']) {
  if (result === 'pass') return <CheckCircle2 size={15}/>;
  if (result === 'fail') return <CircleAlert size={15}/>;
  if (result === 'warning') return <ShieldAlert size={15}/>;
  return <CircleHelp size={15}/>;
}

export default function AuditPanel({
  report, onExport, busy,
}: { report: AuditReport; onExport: () => void; busy: boolean }) {
  return <div className="panel">
    <div className="panel-heading">
      <div><Activity size={17}/><strong>CLASSIC INTEGRATION AUDITOR</strong></div>
      <span>PRE-FLIGHT / v1.0</span>
    </div>
    <div className="audit-content">
      <p className="audit-subtitle">Evidence-based checks of the files staged in this browser, not the installed game.</p>
      <div className={'audit-state '+(report.structuralState === 'blocked' ? 'audit-blocked' : 'audit-consistent')}>
        {report.structuralState === 'blocked' ? <CircleAlert size={22}/> : <FileCheck2 size={22}/>}
        <div>
          <strong>{report.structuralState === 'blocked' ? 'STRUCTURAL CHECKS BLOCKED' : 'CONSISTENT FOR REVIEW'}</strong>
          <span>GAME INSTALLATION NOT VERIFIED</span>
        </div>
      </div>
      <div className="audit-metrics">
        <span><strong>{report.totals.pass}</strong> PASS</span>
        <span><strong>{report.totals.warning}</strong> CAUTION</span>
        <span><strong>{report.totals.fail}</strong> BLOCKED</span>
        <span><strong>{report.totals.notChecked}</strong> UNKNOWN</span>
      </div>
      {report.itemTraces.length > 0 && <div className="audit-traces">
        <h3>ITEM DEPENDENCY TRACES</h3>
        {report.itemTraces.slice(0,8).map((item,index)=><div className="audit-trace" key={item.prototype+'-'+index}>
          <div className="audit-trace-title"><FileSearch size={15}/><strong>{item.prototype}</strong>
            <small className={item.status === 'broken' ? 'audit-tone-error' : item.status === 'linked-in-stage' ? 'audit-tone-success' : ''}>
              {item.status.replaceAll('-', ' ').toUpperCase()}
            </small>
          </div>
          <p>PID {item.pid} → {item.artFid} → {item.artFilename ?? 'UNRESOLVED ART'}</p>
          <p>ITEM MESSAGES {item.messageIds[0]} / {item.messageIds[1]}</p>
          <p>ART STATUS: {item.spriteSource === 'staged' ? 'STAGED FRM' : item.spriteSource === 'external-unknown' ? 'NOT STAGED; INSTALLED GAME UNKNOWN' : 'ART INDEX UNRESOLVED'}</p>
        </div>)}
        {report.itemTraces.length>8&&<p className="audit-more">+ {report.itemTraces.length-8} additional item traces in the downloaded report</p>}
      </div>}
      <div className="audit-findings">
        <h3>IMPORTANT FINDINGS</h3>
        {report.checks.filter(c=>c.result!=='pass').slice(0,10).map((entry,index)=>
          <div key={entry.code+'-'+index} className={'audit-finding audit-'+entry.result}>
            {iconFor(entry.result)}
            <span><strong>{entry.code}</strong> {entry.detail}</span>
          </div>)}
        {report.checks.filter(c=>c.result!=='pass').length>10 &&
          <p className="audit-more">More checks in the full JSON / text report.</p>}
      </div>
      <button className="btn btn-outline btn-full" type="button" onClick={onExport} disabled={busy}>
        <FileSearch size={16}/> DOWNLOAD PREFLIGHT REPORT (JSON)
      </button>
      <p className="audit-fineprint">Structural checks passing means only that staged references agree. Runtime compatibility, actual installed assets, engine behavior and distribution rights remain unverified. Review-only output. No game files were changed.</p>
    </div>
  </div>;
}
