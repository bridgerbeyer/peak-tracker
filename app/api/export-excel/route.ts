import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

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
      coItems: unitCOs.map((co: any) => ({ label: co.title, amount: Number(co.amount), included: !!co.included_in_price })),
    }
  })

  const ts = Date.now()
  const tmpJson = join(tmpdir(), `peak_${ts}.json`)
  const tmpXlsx = join(tmpdir(), `peak_${ts}.xlsx`)
  writeFileSync(tmpJson, JSON.stringify(rows))

  const scriptPath = resolve(process.cwd(), 'scripts', 'build_excel.py')

  try {
    execSync(`python3 "${scriptPath}" "${tmpJson}" "${tmpXlsx}"`, { timeout: 30000 })
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
