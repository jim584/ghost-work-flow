import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current date info
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthYear = previousMonth.toISOString().split('T')[0] // Format: YYYY-MM-DD

    console.log(`Starting monthly reset for ${monthYear}`)

    // Fetch all sales targets
    const { data: targets, error: fetchError } = await supabase
      .from('sales_targets')
      .select('*')

    if (fetchError) {
      console.error('Error fetching targets:', fetchError)
      throw fetchError
    }

    if (!targets || targets.length === 0) {
      console.log('No sales targets to archive')
      return new Response(
        JSON.stringify({ message: 'No targets to archive', archived: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${targets.length} sales targets to archive`)

    // Archive each target to history
    const historyRecords = targets.map(target => ({
      user_id: target.user_id,
      month_year: monthYear,
      transferred_orders_count: target.transferred_orders_count,
      closed_orders_count: target.closed_orders_count,
      upsell_revenue: target.upsell_revenue,
      monthly_order_target: target.monthly_order_target,
      monthly_dollar_target: target.monthly_dollar_target,
    }))

    // Insert history records (upsert to handle re-runs)
    const { error: insertError } = await supabase
      .from('sales_performance_history')
      .upsert(historyRecords, { onConflict: 'user_id,month_year' })

    if (insertError) {
      console.error('Error inserting history:', insertError)
      throw insertError
    }

    console.log(`Archived ${historyRecords.length} records to history`)

    // Reset counters (keep targets intact)
    const { error: resetError } = await supabase
      .from('sales_targets')
      .update({
        transferred_orders_count: 0,
        closed_orders_count: 0,
        upsell_revenue: 0,
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000') // Update all rows

    if (resetError) {
      console.error('Error resetting targets:', resetError)
      throw resetError
    }

    console.log('Successfully reset all counters')

    return new Response(
      JSON.stringify({ 
        message: 'Monthly reset completed successfully',
        archived: historyRecords.length,
        month: monthYear
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in reset-monthly-targets:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
