require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // bypassing RLS for analysis
const supabase = createClient(supabaseUrl, supabaseKey);

const AC_API_URL = process.env.AC_API_URL;
const AC_API_KEY = process.env.AC_API_KEY;

const GROUP_SDR = "1";
const GROUP_CLOSER = "3";

async function fetchAcDeals(groupId) {
    let allDeals = [];
    let offset = 0;
    while (true) {
        const url = `${AC_API_URL}/api/3/deals?filters[group]=${groupId}&limit=100&offset=${offset}`;
        const res = await fetch(url, {
            headers: { "Api-Token": AC_API_KEY }
        });
        const data = await res.json();
        if (!data.deals || data.deals.length === 0) break;
        allDeals = allDeals.concat(data.deals);
        offset += 100;
        process.stdout.write(`\rFetched ${allDeals.length} deals from AC (Group ${groupId})...`);
    }
    console.log();
    return allDeals;
}

async function fetchSupabaseDeals(groupId) {
    let allRows = [];
    let from = 0;
    const limit = 1000;
    while (true) {
        const { data } = await supabase
            .from("deals")
            .select("*")
            .eq("group_id", groupId)
            .range(from, from + limit - 1);

        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < limit) break;
        from += limit;
    }
    return allRows;
}

async function analyze() {
    console.log("=== ActiveCampaign vs Supabase Validation ===");

    // 1. Volumes Totais
    console.log("\\n1. Fetching AC SDR Deals (Group 1)...");
    const acSdr = await fetchAcDeals("1");

    console.log("\\n2. Fetching Supabase SDR Deals (Group 1)...");
    const dbSdr = await fetchSupabaseDeals("1");

    console.log("\\n3. Fetching AC Closer Deals (Group 3)...");
    const acCloser = await fetchAcDeals("3");

    console.log("\\n4. Fetching Supabase Closer Deals (Group 3)...");
    const dbCloser = await fetchSupabaseDeals("3");

    console.log("\\n============================================");
    console.log("VOLUME SDR (Group 1):");
    console.log(`ActiveCampaign: ${acSdr.length}`);
    console.log(`Supabase:       ${dbSdr.length}`);
    console.log(`Diferença:      ${Math.abs(acSdr.length - dbSdr.length)}`);

    console.log("\\nVOLUME CLOSER (Group 3):");
    console.log(`ActiveCampaign: ${acCloser.length}`);
    console.log(`Supabase:       ${dbCloser.length}`);
    console.log(`Diferença:      ${Math.abs(acCloser.length - dbCloser.length)}`);
    console.log("============================================");

    // 2. Won Status em cada um (Casamentos Ganhos)
    // Para AC, somamos Won de todas as possíveis pipelines de weddings (1, 3, 4, 5, 6, 8, 10, etc) 
    // ou apenas focamos no total geral de status=0 se quisermos paridade total.
    // O Dashboard agora pega de QUALQUER pipeline se tiver a data.
    const { data: allDbDeals } = await supabase.from("deals").select("status, data_fechamento, ww_closer_data_hora_ganho");
    const dbCloserWon = allDbDeals.filter(d => (d.status === "Won" || d.status === "0") && (d.data_fechamento !== null || d.ww_closer_data_hora_ganho !== null)).length;

    // Para simplificar a verificação no AC, vamos buscar o total de status=0 independente do grupo
    const acCloserWon = acCloser.filter(d => d.status === "0").length; // Isso é só pro Grupo 3

    console.log("\\nSTATUS WON (GLOBAL SUPABASE vs AC GROUP 3):");
    console.log(`ActiveCampaign Group 3 (Status=0): ${acCloserWon}`);
    console.log(`Supabase GLOBAL (Status=Won + data_fechamento|ww_closer_data_hora_ganho): ${dbCloserWon}`);

    // 3. Open Status em cada um
    const acCloserOpen = acCloser.filter(d => d.status === "1").length;
    const dbCloserOpen = dbCloser.filter(d => d.status === "Open").length;

    console.log("\\nSTATUS OPEN (Group 3):");
    console.log(`ActiveCampaign (Status=1): ${acCloserOpen}`);
    console.log(`Supabase (Status=Open): ${dbCloserOpen}`);

    // 4. Lost Status em cada um
    const acCloserLost = acCloser.filter(d => d.status === "2").length;
    const dbCloserLost = dbCloser.filter(d => d.status === "Lost").length;

    console.log("\\nSTATUS LOST (Group 3):");
    console.log(`ActiveCampaign (Status=2): ${acCloserLost}`);
    console.log(`Supabase (Status=Lost): ${dbCloserLost}`);
    console.log("============================================");
}

analyze().catch(console.error);
