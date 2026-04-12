import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [unitsRes, costsRes, changeOrdersRes] = await Promise.all([
    supabase.from('units').select('*').order('name'),
    supabase.from('unit_costs').select('*'),
    supabase.from('change_orders').select('*').neq('status', 'Rejected'),
  ])

  const units = unitsRes.data || []
  const costs = costsRes.data || []
  const changeOrders = changeOrdersRes.data || []

  const rows = units.map((u: any) => {
    const unitCosts = costs.filter((c: any) => c.unit_id === u.id)
    const unitCOs = changeOrders.filter((co: any) => co.unit_id === u.id)
    const totalCosts = unitCosts.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0)
    const addOnCOs = unitCOs.filter((co: any) => !co.included_in_price).reduce((s: number, co: any) => s + (Number(co.amount) || 0), 0)
    const includedCOs = unitCOs.filter((co: any) => co.included_in_price).reduce((s: number, co: any) => s + (Number(co.amount) || 0), 0)
    const price = Number(u.purchase_price) || 0
    const commPct = Number(u.realtor_commission) || 0
    const commission = price * (commPct / 100)
    const finalPrice = price + addOnCOs
    const net = finalPrice - commission - totalCosts
    return {
      unit: u.name, phase: u.phase, status: u.status,
      buyer: u.buyer_name || '', closeDate: u.close_date || '',
      price, commissionPct: commPct, commission,
      costs: totalCosts, addOnCOs, includedCOs, finalPrice, net,
      costItems: unitCosts.map((c: any) => ({ label: c.label, amount: Number(c.amount) })),
      coItems: unitCOs.map((co: any) => ({ label: co.title, amount: Number(co.amount), included: co.included_in_price })),
    }
  })

  const tmpJson = join(tmpdir(), `peak_${Date.now()}.json`)
  const tmpXlsx = join(tmpdir(), `peak_${Date.now()}.xlsx`)
  writeFileSync(tmpJson, JSON.stringify(rows))

  const py = String.raw`
import openpyxl,json
from openpyxl.styles import Font,PatternFill,Alignment,Border,Side
from openpyxl.utils import get_column_letter
from openpyxl import Workbook

rows=json.loads(open("TMPJSON").read())
RED="CC2222";DARK="1A1A1A";GH="2C2C2E";GL="F5F5F5";GRN="059669";W="FFFFFF"
def fl(c): return PatternFill("solid",fgColor=c)
def bd():
    t=Side(style="thin",color="E0E0E0")
    return Border(left=t,right=t,top=t,bottom=t)
def cur(): return '$#,##0;($#,##0);"-"'
def pct(): return '0.0%'
def cw(ws,c,w): ws.column_dimensions[get_column_letter(c)].width=w
def wh(ws,r,c,v,bg=None,fc=W,a="center"):
    x=ws.cell(row=r,column=c,value=v)
    x.font=Font(name="Arial",size=10,bold=True,color=fc)
    x.fill=fl(bg or GH);x.alignment=Alignment(horizontal=a,vertical="center",wrap_text=True);x.border=bd()
def wc(ws,r,c,v,bold=False,color=DARK,align="left",nf=None,bg=None):
    x=ws.cell(row=r,column=c,value=v)
    x.font=Font(name="Arial",size=10,bold=bold,color=color)
    x.alignment=Alignment(horizontal=align,vertical="center");x.border=bd()
    if nf:x.number_format=nf
    if bg:x.fill=fl(bg)
SBG={"Sold":"D1FAE5","Under Contract":"FEF3C7","Available":"F3F4F6"}
SFC={"Sold":"065F46","Under Contract":"92400E","Available":"374151"}
wb=Workbook()

# Sheet 1
ws=wb.active;ws.title="Sales Pipeline";ws.freeze_panes="A4";ws.sheet_view.showGridLines=False
ws.row_dimensions[1].height=40;ws.row_dimensions[3].height=28
ws.merge_cells("A1:N1");t=ws["A1"];t.value="PEAK CONDO STORAGE — Sales Pipeline"
t.font=Font(name="Arial",size=14,bold=True,color=W);t.fill=fl(RED);t.alignment=Alignment(horizontal="left",vertical="center",indent=1)
ws.merge_cells("A2:N2");s=ws["A2"];s.value="Construction Knowledge Base Export"
s.font=Font(name="Arial",size=9,color="888888");s.alignment=Alignment(horizontal="left",vertical="center",indent=1)
hdrs=[("Unit",8),("Phase",10),("Status",14),("Buyer",16),("Close Date",12),("List Price",13),("Comm %",8),("Commission",13),("Costs",13),("Add-on COs",13),("Included COs",13),("Final Price",13),("Net to Seller",14),("Notes",34)]
for i,(h,w) in enumerate(hdrs,1):
    wh(ws,3,i,h);cw(ws,i,w)
for ri,row in enumerate(rows,4):
    bg=SBG.get(row["status"],"FFFFFF");fc=SFC.get(row["status"],DARK)
    wc(ws,ri,1,row["unit"],bold=True);wc(ws,ri,2,row["phase"])
    wc(ws,ri,3,row["status"],bold=True,color=fc,bg=bg,align="center")
    wc(ws,ri,4,row["buyer"] or "—");wc(ws,ri,5,row["closeDate"] or "—",align="center")
    wc(ws,ri,6,row["price"] or None,align="right",nf=cur())
    wc(ws,ri,7,(row["commissionPct"] or 0)/100,align="right",nf=pct())
    wc(ws,ri,8,row["commission"] or None,align="right",nf=cur(),color="CC2222" if row["commission"] else DARK)
    wc(ws,ri,9,row["costs"] or None,align="right",nf=cur(),color="CC2222" if row["costs"] else DARK)
    wc(ws,ri,10,row["addOnCOs"] or None,align="right",nf=cur(),color="CC2222" if row["addOnCOs"] else DARK)
    wc(ws,ri,11,row["includedCOs"] or None,align="right",nf=cur())
    wc(ws,ri,12,row["finalPrice"] or None,bold=True,align="right",nf=cur())
    nc=GRN if row["net"]>0 else "CC2222"
    wc(ws,ri,13,row["net"] or None,bold=True,align="right",nf=cur(),color=nc if row["net"] else DARK)
    notes=" | ".join(filter(None,[
        " | ".join(f"{x['label']}: ${int(x['amount']):,}" for x in row["costItems"]),
        " | ".join(f"{x['label']}: ${int(x['amount']):,} ({'Incl' if x['included'] else 'Add-on'})" for x in row["coItems"])
    ]));wc(ws,ri,14,notes or "—",color="666666")
n=3+len(rows);sr=n+2
ws.merge_cells(f"A{sr}:E{sr}");sh=ws.cell(row=sr,column=1,value="SUMMARY")
sh.font=Font(name="Arial",size=10,bold=True,color=W);sh.fill=fl(GH);sh.alignment=Alignment(horizontal="left",vertical="center",indent=1)
si=[("Total Units",f"=COUNTA(A4:A{n})"),("Sold",f'=COUNTIF(C4:C{n},"Sold")'),("Under Contract",f'=COUNTIF(C4:C{n},"Under Contract")'),("Available",f'=COUNTIF(C4:C{n},"Available")'),("Pipeline Value",f'=SUMIF(C4:C{n},"Under Contract",L4:L{n})'),("Closed Value",f'=SUMIF(C4:C{n},"Sold",L4:L{n})'),("Avg Net (Sold)",f'=IFERROR(SUMIF(C4:C{n},"Sold",M4:M{n})/COUNTIF(C4:C{n},"Sold"),0)'),("Total Net",f"=SUM(M4:M{n})")]
for i,(lb,fm) in enumerate(si):
    r2=sr+1+i;lc=ws.cell(row=r2,column=1,value=lb)
    lc.font=Font(name="Arial",size=10,bold=True);lc.alignment=Alignment(horizontal="left",vertical="center");lc.border=bd();lc.fill=fl(GL)
    ws.merge_cells(f"A{r2}:E{r2}")
    vc=ws.cell(row=r2,column=6,value=fm);vc.font=Font(name="Arial",size=10)
    vc.alignment=Alignment(horizontal="right",vertical="center");vc.border=bd()
    if any(x in lb for x in ["Value","Net","Avg"]):vc.number_format=cur()
    ws.merge_cells(f"F{r2}:H{r2}")

# Sheet 2 By Phase
ws2=wb.create_sheet("By Phase");ws2.sheet_view.showGridLines=False
ws2.merge_cells("A1:F1");t2=ws2["A1"];t2.value="Phase Breakdown"
t2.font=Font(name="Arial",size=13,bold=True,color=W);t2.fill=fl(RED);t2.alignment=Alignment(horizontal="left",vertical="center",indent=1)
ws2.row_dimensions[1].height=36
phases=sorted(set(r["phase"] for r in rows));sr2=3
for ph in phases:
    prows=[r for r in rows if r["phase"]==ph]
    ws2.merge_cells(f"A{sr2}:F{sr2}");pc=ws2.cell(row=sr2,column=1,value=ph.upper())
    pc.font=Font(name="Arial",size=10,bold=True,color=W);pc.fill=fl(GH);pc.alignment=Alignment(horizontal="left",vertical="center",indent=1)
    ws2.row_dimensions[sr2].height=22;sr2+=1
    for i,h in enumerate(["Unit","Status","Buyer","Final Price","Net","Close Date"],1):
        wh(ws2,sr2,i,h,bg="3A3A3C");sr2 and None
    sr2+=1
    for row in prows:
        bg=SBG.get(row["status"],"FFFFFF");fc=SFC.get(row["status"],DARK)
        wc(ws2,sr2,1,row["unit"],bold=True);wc(ws2,sr2,2,row["status"],color=fc,bg=bg,align="center",bold=True)
        wc(ws2,sr2,3,row["buyer"] or "—");wc(ws2,sr2,4,row["finalPrice"] or None,nf=cur(),align="right")
        nc=GRN if row["net"]>0 else "CC2222"
        wc(ws2,sr2,5,row["net"] or None,nf=cur(),align="right",color=nc if row["net"] else DARK,bold=True)
        wc(ws2,sr2,6,row["closeDate"] or "—",align="center");sr2+=1
    sr2+=1
for i,w in enumerate([8,14,16,13,14,12],1):cw(ws2,i,w)

# Sheet 3 Cost Detail
ws3=wb.create_sheet("Cost Detail");ws3.sheet_view.showGridLines=False
ws3.merge_cells("A1:G1");t3=ws3["A1"];t3.value="Cost & Change Order Detail"
t3.font=Font(name="Arial",size=13,bold=True,color=W);t3.fill=fl(RED);t3.alignment=Alignment(horizontal="left",vertical="center",indent=1)
ws3.row_dimensions[1].height=36
for i,h in enumerate(["Unit","Phase","Status","Item","Amount","Type","Pricing"],1):wh(ws3,3,i,h)
for i,w in enumerate([8,10,14,28,13,16,18],1):cw(ws3,i,w)
r3=4
for row in rows:
    for item in row["costItems"]:
        bg=SBG.get(row["status"],"FFFFFF");fc=SFC.get(row["status"],DARK)
        wc(ws3,r3,1,row["unit"],bold=True);wc(ws3,r3,2,row["phase"])
        wc(ws3,r3,3,row["status"],color=fc,bg=bg,align="center")
        wc(ws3,r3,4,item["label"]);wc(ws3,r3,5,item["amount"],nf=cur(),align="right",color="CC2222")
        wc(ws3,r3,6,"Cost/Concession");wc(ws3,r3,7,"N/A",align="center");r3+=1
    for item in row["coItems"]:
        bg=SBG.get(row["status"],"FFFFFF");fc=SFC.get(row["status"],DARK)
        wc(ws3,r3,1,row["unit"],bold=True);wc(ws3,r3,2,row["phase"])
        wc(ws3,r3,3,row["status"],color=fc,bg=bg,align="center")
        wc(ws3,r3,4,item["label"]);wc(ws3,r3,5,item["amount"],nf=cur(),align="right",color="CC2222")
        wc(ws3,r3,6,"Change Order")
        it="Included in Price" if item["included"] else "Add-on (+to Price)"
        wc(ws3,r3,7,it,color=GRN if item["included"] else "CC2222",align="center");r3+=1

wb.save("TMPXLSX")
print("ok")
`.replace('TMPJSON', tmpJson).replace('TMPXLSX', tmpXlsx)

  try {
    execSync(`python3 -c '${py}'`, { timeout: 30000 })
    const buf = readFileSync(tmpXlsx)
    try { unlinkSync(tmpJson); unlinkSync(tmpXlsx) } catch {}
    const date = new Date().toISOString().split('T')[0]
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="PeakCondoStorage_Pipeline_${date}.xlsx"`,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message) }, { status: 500 })
  }
}
