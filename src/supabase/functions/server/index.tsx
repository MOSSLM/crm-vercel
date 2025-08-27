import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';
import * as kv from './kv_store.tsx';
import * as journal from './journal.tsx';

const app = new Hono();

// Add CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Add logger middleware
app.use('*', logger(console.log));

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Route prefix
const routePrefix = '/make-server-5c06d9e7';

// Health check
app.get(`${routePrefix}/health`, (c) => {
  return c.json({ status: 'OK', timestamp: new Date().toISOString() });
});



// Enhanced contacts API with extended fields support
app.get(`${routePrefix}/contacts`, async (c) => {
  try {
    // Get basic contacts from Supabase
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase contacts error:', error);
      return c.json({ error: 'Failed to fetch contacts' }, 500);
    }

    // Enhance contacts with extended fields from KV store
    const enhancedContacts = await Promise.all(
      (contacts || []).map(async (contact) => {
        try {
          const extendedData = await kv.get(`contact_extended_${contact.id}`);
          return {
            ...contact,
            ...extendedData, // This will include linkedin, notes, etc.
            // Legacy compatibility
            nom: contact.last_name,
            prenom: contact.first_name
          };
        } catch (e) {
          console.error('Error fetching extended contact data:', e);
          return {
            ...contact,
            nom: contact.last_name,
            prenom: contact.first_name
          };
        }
      })
    );

    return c.json(enhancedContacts);
  } catch (error) {
    console.error('Error in contacts endpoint:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get contacts by company ID
app.get(`${routePrefix}/contacts/company/:companyId`, async (c) => {
  try {
    const companyId = parseInt(c.req.param('companyId'));
    
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('entreprise_id', companyId);

    if (error) {
      console.error('Supabase contacts error:', error);
      return c.json({ error: 'Failed to fetch contacts' }, 500);
    }

    // Enhance contacts with extended fields from KV store
    const enhancedContacts = await Promise.all(
      (contacts || []).map(async (contact) => {
        try {
          const extendedData = await kv.get(`contact_extended_${contact.id}`);
          return {
            ...contact,
            ...extendedData,
            nom: contact.last_name,
            prenom: contact.first_name
          };
        } catch (e) {
          return {
            ...contact,
            nom: contact.last_name,
            prenom: contact.first_name
          };
        }
      })
    );

    return c.json(enhancedContacts);
  } catch (error) {
    console.error('Error in contacts by company endpoint:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create contact with extended fields
app.post(`${routePrefix}/contacts`, async (c) => {
  try {
    const body = await c.req.json();
    
    // Extract basic fields for Supabase
    const basicFields = {
      entreprise_id: body.entreprise_id,
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      tel: body.tel
    };

    // Extract extended fields for KV store
    const extendedFields = {
      poste: body.poste,
      linkedin: body.linkedin,
      is_decision_maker: body.is_decision_maker,
      notes: body.notes
    };

    // Create contact in Supabase
    const { data: contact, error } = await supabase
      .from('contacts')
      .insert([basicFields])
      .select()
      .single();

    if (error) {
      console.error('Supabase contact creation error:', error);
      return c.json({ error: 'Failed to create contact' }, 500);
    }

    // Store extended fields in KV store
    if (contact) {
      try {
        await kv.set(`contact_extended_${contact.id}`, extendedFields);
      } catch (kvError) {
        console.error('KV store error:', kvError);
        // Continue even if KV store fails
      }
    }

    return c.json({
      ...contact,
      ...extendedFields,
      nom: contact.last_name,
      prenom: contact.first_name
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update contact with extended fields
app.put(`${routePrefix}/contacts/:id`, async (c) => {
  try {
    const contactId = c.req.param('id');
    const body = await c.req.json();
    
    // Extract basic fields for Supabase
    const basicFields: any = {};
    if (body.entreprise_id !== undefined) basicFields.entreprise_id = body.entreprise_id;
    if (body.first_name !== undefined) basicFields.first_name = body.first_name;
    if (body.last_name !== undefined) basicFields.last_name = body.last_name;
    if (body.email !== undefined) basicFields.email = body.email;
    if (body.tel !== undefined) basicFields.tel = body.tel;
    if (body.updated_at !== undefined) basicFields.updated_at = body.updated_at;

    // Extract extended fields for KV store
    const extendedFields: any = {};
    if (body.poste !== undefined) extendedFields.poste = body.poste;
    if (body.linkedin !== undefined) extendedFields.linkedin = body.linkedin;
    if (body.is_decision_maker !== undefined) extendedFields.is_decision_maker = body.is_decision_maker;
    if (body.notes !== undefined) extendedFields.notes = body.notes;

    // Update contact in Supabase if there are basic fields to update
    let updatedContact = null;
    if (Object.keys(basicFields).length > 0) {
      const { data, error } = await supabase
        .from('contacts')
        .update(basicFields)
        .eq('id', contactId)
        .select()
        .single();

      if (error) {
        console.error('Supabase contact update error:', error);
        return c.json({ error: 'Failed to update contact' }, 500);
      }
      updatedContact = data;
    } else {
      // If no basic fields to update, just get the current contact
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error) {
        console.error('Supabase contact fetch error:', error);
        return c.json({ error: 'Failed to fetch contact' }, 500);
      }
      updatedContact = data;
    }

    // Update extended fields in KV store
    if (Object.keys(extendedFields).length > 0) {
      try {
        // Get existing extended data
        const existingExtended = await kv.get(`contact_extended_${contactId}`) || {};
        // Merge with new data
        const mergedExtended = { ...existingExtended, ...extendedFields };
        await kv.set(`contact_extended_${contactId}`, mergedExtended);
      } catch (kvError) {
        console.error('KV store error:', kvError);
        // Continue even if KV store fails
      }
    }

    // Get final extended data
    let finalExtendedData = {};
    try {
      finalExtendedData = await kv.get(`contact_extended_${contactId}`) || {};
    } catch (e) {
      console.error('Error fetching final extended data:', e);
    }

    return c.json({
      ...updatedContact,
      ...finalExtendedData,
      nom: updatedContact.last_name,
      prenom: updatedContact.first_name
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Contact notes endpoints using KV store
app.get(`${routePrefix}/contacts/:id/notes`, async (c) => {
  try {
    const contactId = c.req.param('id');
    const notes = await kv.get(`contact_notes_${contactId}`) || [];
    
    return c.json(notes);
  } catch (error) {
    console.error('Error fetching contact notes:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/contacts/:id/notes`, async (c) => {
  try {
    const contactId = c.req.param('id');
    const body = await c.req.json();
    
    // Get existing notes
    const existingNotes = await kv.get(`contact_notes_${contactId}`) || [];
    
    // Create new note
    const newNote = {
      id: Date.now(), // Simple ID generation
      contact_id: contactId,
      note: body.note,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Add to existing notes
    const updatedNotes = [newNote, ...existingNotes];
    await kv.set(`contact_notes_${contactId}`, updatedNotes);
    
    return c.json(newNote);
  } catch (error) {
    console.error('Error creating contact note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.put(`${routePrefix}/contacts/:contactId/notes/:noteId`, async (c) => {
  try {
    const contactId = c.req.param('contactId');
    const noteId = parseInt(c.req.param('noteId'));
    const body = await c.req.json();
    
    // Get existing notes
    const existingNotes = await kv.get(`contact_notes_${contactId}`) || [];
    
    // Update the specific note
    const updatedNotes = existingNotes.map((note: any) => {
      if (note.id === noteId) {
        return {
          ...note,
          note: body.note,
          updated_at: new Date().toISOString()
        };
      }
      return note;
    });
    
    await kv.set(`contact_notes_${contactId}`, updatedNotes);
    
    const updatedNote = updatedNotes.find((note: any) => note.id === noteId);
    return c.json(updatedNote);
  } catch (error) {
    console.error('Error updating contact note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.delete(`${routePrefix}/contacts/:contactId/notes/:noteId`, async (c) => {
  try {
    const contactId = c.req.param('contactId');
    const noteId = parseInt(c.req.param('noteId'));
    
    // Get existing notes
    const existingNotes = await kv.get(`contact_notes_${contactId}`) || [];
    
    // Remove the specific note
    const updatedNotes = existingNotes.filter((note: any) => note.id !== noteId);
    await kv.set(`contact_notes_${contactId}`, updatedNotes);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact note:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Search results endpoints
app.get(`${routePrefix}/searches`, async (c) => {
  try {
    const searches = await kv.getByPrefix('search_');
    const searchList = searches.map((search: any) => ({
      ...search,
      id: search.id || crypto.randomUUID(),
      created_at: search.created_at || new Date().toISOString()
    }));
    
    return c.json(searchList);
  } catch (error) {
    console.error('Error fetching searches:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Companies endpoints
app.get(`${routePrefix}/companies`, async (c) => {
  try {
    const companies = await kv.getByPrefix('company_');
    const companyList = companies.map((company: any) => ({
      ...company,
      id: company.id || Date.now(),
      created_at: company.created_at || new Date().toISOString(),
      updated_at: company.updated_at || new Date().toISOString()
    }));
    
    return c.json(companyList);
  } catch (error) {
    console.error('Error fetching companies:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// KPI endpoints for objectives system
app.get(`${routePrefix}/kpi/targets`, async (c) => {
  try {
    const targets = await kv.getByPrefix('kpi_target_');
    return c.json(targets);
  } catch (error) {
    console.error('Error fetching KPI targets:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/kpi/targets`, async (c) => {
  try {
    const body = await c.req.json();
    const { periode, targets } = body;
    
    // Store targets for the period
    await kv.set(`kpi_target_${periode}`, {
      periode,
      ...targets,
      created_at: new Date().toISOString()
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error saving KPI targets:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get(`${routePrefix}/kpi/progress/:periode`, async (c) => {
  try {
    const periode = c.req.param('periode');
    const progress = await kv.get(`kpi_progress_${periode}`) || {};
    
    return c.json(progress);
  } catch (error) {
    console.error('Error fetching KPI progress:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Objectives endpoints
app.post(`${routePrefix}/objectives`, async (c) => {
  try {
    const { objectives } = await c.req.json();
    
    if (!Array.isArray(objectives)) {
      return c.json({ error: 'Format invalide: objectives doit être un tableau' }, 400);
    }

    // Supprimer les objectifs existants pour les mêmes périodes (upsert)
    for (const objective of objectives) {
      // D'abord supprimer l'objectif existant pour cette période
      await supabase
        .from('kpi_objectives')
        .delete()
        .eq('period_unit', objective.period_unit)
        .eq('period_start', objective.period_start);

      // Insérer le nouvel objectif
      const { error } = await supabase
        .from('kpi_objectives')
        .insert([{
          period_unit: objective.period_unit,
          period_start: objective.period_start,
          period_end: objective.period_end,
          leads_trouves: objective.leads_trouves || 0,
          leads_qualifies: objective.leads_qualifies || 0,
          appels: objective.appels || 0,
          rdv: objective.rdv || 0,
          devis: objective.devis || 0,
          relances: objective.relances || 0,
          signatures: objective.signatures || 0,
          acomptes: objective.acomptes || 0,
          leadmagnets: objective.leadmagnets || 0,
          relances_total: objective.relances_total || 0,
          ca: objective.ca || 0,
          mrr: objective.mrr || 0,
          label: objective.label || null
        }]);

      if (error) {
        console.error('Erreur lors de l\'insertion d\'objectif:', error);
        return c.json({ error: 'Erreur lors de la sauvegarde' }, 500);
      }
    }

    console.log(`${objectives.length} objectifs sauvegardés`);
    return c.json({ success: true, count: objectives.length });

  } catch (error) {
    console.error('Erreur lors de la sauvegarde des objectifs:', error);
    return c.json({ error: 'Erreur interne du serveur' }, 500);
  }
});

app.get(`${routePrefix}/objectives`, async (c) => {
  try {
    const { data: objectives, error } = await supabase
      .from('kpi_objectives')
      .select('*')
      .order('period_start', { ascending: true });

    if (error) {
      console.error('Erreur lors de la récupération des objectifs:', error);
      return c.json({ error: 'Erreur lors de la récupération' }, 500);
    }

    return c.json(objectives || []);
  } catch (error) {
    console.error('Erreur lors de la récupération des objectifs:', error);
    return c.json({ error: 'Erreur interne du serveur' }, 500);
  }
});

app.get(`${routePrefix}/kpi/by-period`, async (c) => {
  try {
    const periodType = c.req.query('type') || 'month';
    
    // Récupérer les données de la vue v_kpi_totals_from_journal
    const { data: kpiData, error } = await supabase
      .from('v_kpi_totals_from_journal')
      .select('metric, total, total_week, total_month, total_quarter, total_year');

    if (error) {
      console.error('Erreur lors de la récupération des données KPI:', error);
      return c.json({ error: 'Erreur lors de la récupération des données KPI' }, 500);
    }

    // Transformer les données réelles en fonction de la période demandée
    const periodData = transformRealKpiDataByPeriod(kpiData || [], periodType);
    return c.json(periodData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données KPI par période:', error);
    return c.json({ error: 'Erreur interne du serveur' }, 500);
  }
});

app.get(`${routePrefix}/kpi/historical`, async (c) => {
  try {
    const periodType = c.req.query('type') || 'month';
    const limit = parseInt(c.req.query('limit') || '24');
    
    // Récupérer les données historiques réelles du journal de succès par période
    const historicalData = await getHistoricalDataFromJournal(periodType, limit);
    return c.json(historicalData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données historiques:', error);
    return c.json({ error: 'Erreur interne du serveur' }, 500);
  }
});

// Route pour récupérer les données de plusieurs périodes récentes (pour le tableau)
app.get(`${routePrefix}/kpi/recent-periods`, async (c) => {
  try {
    const periodType = c.req.query('type') || 'month';
    const count = parseInt(c.req.query('count') || '6'); // Les 6 dernières périodes par défaut
    
    // Récupérer les données des dernières périodes avec les vraies données du journal
    const recentData = await getRecentPeriodsDataFromJournal(periodType, count);
    return c.json(recentData);

  } catch (error) {
    console.error('Erreur lors de la récupération des données des périodes récentes:', error);
    return c.json({ error: 'Erreur interne du serveur' }, 500);
  }
});

// Journal de succès endpoints
app.post(`${routePrefix}/journal/log`, async (c) => {
  try {
    const body = await c.req.json();
    await journal.logEvent(body);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging journal event:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/call`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logCall(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging call:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/relance`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logRelance(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging relance:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/rdv`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logRdv(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging rdv:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/devis`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logDevis(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging devis:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/signature`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logSignature(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging signature:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/acompte`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logAcompte(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging acompte:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post(`${routePrefix}/journal/lead-magnet`, async (c) => {
  try {
    const body = await c.req.json();
    const { opportunite_id, entreprise_id, description } = body;
    await journal.logLeadMagnet(opportunite_id, entreprise_id, description);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error logging lead magnet:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get(`${routePrefix}/journal/stats`, async (c) => {
  try {
    const opportunite_id = c.req.query('opportunite_id');
    const entreprise_id = c.req.query('entreprise_id') ? parseInt(c.req.query('entreprise_id')!) : undefined;
    
    const stats = await journal.getJournalStats(opportunite_id, entreprise_id);
    return c.json(stats);
  } catch (error) {
    console.error('Error getting journal stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get(`${routePrefix}/journal/history`, async (c) => {
  try {
    const opportunite_id = c.req.query('opportunite_id');
    const entreprise_id = c.req.query('entreprise_id') ? parseInt(c.req.query('entreprise_id')!) : undefined;
    
    const history = await journal.getJournalHistory(opportunite_id, entreprise_id);
    return c.json(history);
  } catch (error) {
    console.error('Error getting journal history:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get(`${routePrefix}/journal/next-sequence/:type`, async (c) => {
  try {
    const type = c.req.param('type');
    const opportunite_id = c.req.query('opportunite_id');
    const entreprise_id = c.req.query('entreprise_id') ? parseInt(c.req.query('entreprise_id')!) : undefined;
    
    const nextNumber = await journal.getNextSequenceNumber(type, opportunite_id, entreprise_id);
    return c.json({ nextNumber });
  } catch (error) {
    console.error('Error getting next sequence number:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Endpoint pour récupérer les totaux KPI depuis la vue journal
app.get(`${routePrefix}/kpi/journal-totals`, async (c) => {
  try {
    // Essayer d'abord avec la vue
    const { data, error } = await supabase
      .from('v_kpi_totals_from_journal')
      .select('metric, total, total_week, total_month, total_quarter, total_year');

    if (error) {
      console.error('Error fetching KPI totals from journal view, trying direct query:', error);
      
      // Si la vue échoue, utiliser une requête directe sur la table journal
      const { data: journalData, error: journalError } = await supabase
        .from('journal_succes')
        .select('type_evenement, created_at');

      if (journalError) {
        console.error('Error fetching from journal_succes table:', journalError);
        return c.json({ error: 'Failed to fetch KPI totals from both view and table' }, 500);
      }

      // Calculer les totaux directement avec les vrais types d'événements
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

      const filterByDate = (events: any[], dateThreshold: Date) => {
        return events.filter(row => new Date(row.created_at) >= dateThreshold);
      };

      // Filtres basés sur les vrais types d'événements du journal
      const allAppels = journalData?.filter(row => 
        row.type_evenement === 'cold_call'
      ) || [];
      const allRelances = journalData?.filter(row => 
        row.type_evenement.startsWith('relance_') // relance_1, relance_2, etc.
      ) || [];
      const allRdvs = journalData?.filter(row => 
        row.type_evenement.startsWith('rdv_') // rdv_1, rdv_2
      ) || [];
      const allDevis = journalData?.filter(row => row.type_evenement === 'devis') || [];
      const allSignatures = journalData?.filter(row => row.type_evenement === 'signature') || [];
      const allAcomptes = journalData?.filter(row => row.type_evenement === 'deposit') || []; // deposit = acompte
      const allLeadMagnets = journalData?.filter(row => row.type_evenement === 'lead_magnet') || [];
      const allQualified = journalData?.filter(row => row.type_evenement === 'qualified') || [];

      const totals = {
        total_appels: allAppels.length,
        total_relances: allRelances.length,
        total_rdvs: allRdvs.length,
        total_devis: allDevis.length,
        total_signatures: allSignatures.length,
        total_acomptes: allAcomptes.length,
        total_lead_magnets: allLeadMagnets.length,
        total_qualified: allQualified.length, // leads qualifiés
        // Périodes
        week: {
          total_appels: filterByDate(allAppels, weekAgo).length,
          total_relances: filterByDate(allRelances, weekAgo).length,
          total_rdvs: filterByDate(allRdvs, weekAgo).length,
          total_devis: filterByDate(allDevis, weekAgo).length,
          total_signatures: filterByDate(allSignatures, weekAgo).length,
          total_acomptes: filterByDate(allAcomptes, weekAgo).length,
          total_lead_magnets: filterByDate(allLeadMagnets, weekAgo).length,
          total_qualified: filterByDate(allQualified, weekAgo).length
        },
        month: {
          total_appels: filterByDate(allAppels, monthAgo).length,
          total_relances: filterByDate(allRelances, monthAgo).length,
          total_rdvs: filterByDate(allRdvs, monthAgo).length,
          total_devis: filterByDate(allDevis, monthAgo).length,
          total_signatures: filterByDate(allSignatures, monthAgo).length,
          total_acomptes: filterByDate(allAcomptes, monthAgo).length,
          total_lead_magnets: filterByDate(allLeadMagnets, monthAgo).length,
          total_qualified: filterByDate(allQualified, monthAgo).length
        },
        quarter: {
          total_appels: filterByDate(allAppels, quarterAgo).length,
          total_relances: filterByDate(allRelances, quarterAgo).length,
          total_rdvs: filterByDate(allRdvs, quarterAgo).length,
          total_devis: filterByDate(allDevis, quarterAgo).length,
          total_signatures: filterByDate(allSignatures, quarterAgo).length,
          total_acomptes: filterByDate(allAcomptes, quarterAgo).length,
          total_lead_magnets: filterByDate(allLeadMagnets, quarterAgo).length,
          total_qualified: filterByDate(allQualified, quarterAgo).length
        },
        year: {
          total_appels: filterByDate(allAppels, yearAgo).length,
          total_relances: filterByDate(allRelances, yearAgo).length,
          total_rdvs: filterByDate(allRdvs, yearAgo).length,
          total_devis: filterByDate(allDevis, yearAgo).length,
          total_signatures: filterByDate(allSignatures, yearAgo).length,
          total_acomptes: filterByDate(allAcomptes, yearAgo).length,
          total_lead_magnets: filterByDate(allLeadMagnets, yearAgo).length,
          total_qualified: filterByDate(allQualified, yearAgo).length
        }
      };

      console.log('KPI totals calculated directly from journal:', totals);
      return c.json(totals);
    }

    console.log('KPI data from view (raw):', JSON.stringify(data, null, 2));

    // Transformer les données de la vue au format attendu
    // La vue retourne des lignes avec { metric: "appels", total: 5, total_week: 2, ... }
    const totals = {
      total_appels: 0,
      total_relances: 0,
      total_rdvs: 0,
      total_devis: 0,
      total_signatures: 0,
      total_acomptes: 0,
      total_lead_magnets: 0,
      total_qualified: 0,
      week: {
        total_appels: 0,
        total_relances: 0,
        total_rdvs: 0,
        total_devis: 0,
        total_signatures: 0,
        total_acomptes: 0,
        total_lead_magnets: 0,
        total_qualified: 0
      },
      month: {
        total_appels: 0,
        total_relances: 0,
        total_rdvs: 0,
        total_devis: 0,
        total_signatures: 0,
        total_acomptes: 0,
        total_lead_magnets: 0,
        total_qualified: 0
      },
      quarter: {
        total_appels: 0,
        total_relances: 0,
        total_rdvs: 0,
        total_devis: 0,
        total_signatures: 0,
        total_acomptes: 0,
        total_lead_magnets: 0,
        total_qualified: 0
      },
      year: {
        total_appels: 0,
        total_relances: 0,
        total_rdvs: 0,
        total_devis: 0,
        total_signatures: 0,
        total_acomptes: 0,
        total_lead_magnets: 0,
        total_qualified: 0
      }
    };

    if (data && data.length > 0) {
      // Transformer les données de la vue
      for (const row of data) {
        const { metric, total, total_week, total_month, total_quarter, total_year } = row;
        const numTotal = Number(total) || 0;
        const numWeek = Number(total_week) || 0;
        const numMonth = Number(total_month) || 0;
        const numQuarter = Number(total_quarter) || 0;
        const numYear = Number(total_year) || 0;
        
        // Mapper les métriques aux noms attendus selon les vrais types d'événements
        const mapMetric = (metric: string) => {
          switch (metric) {
            case 'cold_call':
            case 'appels':
              return 'total_appels';
            case 'relances':
              return 'total_relances';
            case 'rdvs':
            case 'rdv':
              return 'total_rdvs';
            case 'devis':
              return 'total_devis';
            case 'signature':
            case 'signatures':
              return 'total_signatures';
            case 'deposit':
            case 'acomptes':
              return 'total_acomptes';
            case 'lead_magnet':
            case 'lead_magnets':
              return 'total_lead_magnets';
            case 'qualified':
              return 'total_qualified';
            default:
              console.log(`Unknown metric from view: ${metric}`);
              return null;
          }
        };

        const mappedMetric = mapMetric(metric);
        if (mappedMetric) {
          (totals as any)[mappedMetric] = numTotal;
          (totals.week as any)[mappedMetric] = numWeek;
          (totals.month as any)[mappedMetric] = numMonth;
          (totals.quarter as any)[mappedMetric] = numQuarter;
          (totals.year as any)[mappedMetric] = numYear;
        }
      }
    }

    console.log('KPI totals transformed from view:', totals);
    return c.json(totals);
  } catch (error) {
    console.error('Error in KPI journal totals endpoint:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Default route for unmatched paths
app.all('*', (c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});



// Fonction pour transformer les vraies données KPI par période
function transformRealKpiDataByPeriod(kpiData: any[], periodType: string) {
  // Au lieu de générer des périodes futures, retourner seulement la période actuelle avec les vraies données
  const now = new Date();
  const currentPeriod = getCurrentPeriod(now, periodType);
  
  // Créer un objet avec les métriques par défaut
  const metrics = {
    leads_trouves: 0,
    leads_qualifies: 0,
    appels: 0,
    rdv: 0,
    devis: 0,
    relances: 0,
    signatures: 0,
    acomptes: 0,
    leadmagnets: 0,
    relances_total: 0,
    ca: 0,
    mrr: 0
  };

  // Remplir avec les données RÉELLES de la vue (pas de simulation)
  kpiData.forEach(row => {
    const columnName = getPeriodColumnName(periodType);
    const value = row[columnName] || 0;
    
    // Mapper les métriques de la vue aux champs de l'objectif - DONNÉES RÉELLES avec les vrais noms
    switch (row.metric) {
      case 'cold_call':
      case 'appels':
        metrics.appels = value;
        break;
      case 'relances':
        metrics.relances = value;
        break;
      case 'rdv':
      case 'rdvs':
        metrics.rdv = value;
        break;
      case 'devis':
        metrics.devis = value;
        break;
      case 'signature':
      case 'signatures':
        metrics.signatures = value;
        break;
      case 'deposit':
      case 'acomptes':
        metrics.acomptes = value;
        break;
      case 'lead_magnet':
      case 'leadmagnets':
        metrics.leadmagnets = value;
        break;
      case 'qualified':
      case 'leads_qualifies':
        metrics.leads_qualifies = value;
        break;
      case 'leads_trouves':
        metrics.leads_trouves = value;
        break;
      case 'ca':
      case 'chiffre_affaires':
        metrics.ca = value;
        break;
      case 'mrr':
        metrics.mrr = value;
        break;
    }
  });

  // Compter les relances totales (toutes les relances)
  const relancesTotal = kpiData
    .filter(row => row.metric.includes('relance'))
    .reduce((sum, row) => sum + (row[getPeriodColumnName(periodType)] || 0), 0);
  metrics.relances_total = relancesTotal;

  // Retourner seulement la période actuelle avec les vraies données
  return [{
    period_start: currentPeriod.startDate.toISOString().split('T')[0],
    period_end: currentPeriod.endDate.toISOString().split('T')[0],
    period_type: periodType,
    period_label: currentPeriod.label,
    ...metrics
  }];
}

// Fonction pour récupérer les vraies données historiques du journal de succès
async function getHistoricalDataFromJournal(periodType: string, limit: number) {
  const data = [];
  const now = new Date();
  
  for (let i = limit - 1; i >= 0; i--) {
    const period = generateHistoricalPeriod(now, periodType, i);
    
    // Requête pour obtenir les vraies données de cette période depuis le journal
    const { data: journalData, error } = await supabase
      .from('journal_succes')
      .select('type_evenement')
      .gte('date', period.startDate.toISOString())
      .lt('date', period.endDate.toISOString());

    if (error) {
      console.error('Erreur lors de la récupération du journal pour la période:', error);
      // En cas d'erreur, utiliser des valeurs par défaut
      data.push({
        period_start: period.startDate.toISOString().split('T')[0],
        period_end: period.endDate.toISOString().split('T')[0],
        period_type: periodType,
        period_label: period.label,
        leads_trouves: 0,
        leads_qualifies: 0,
        appels: 0,
        rdv: 0,
        devis: 0,
        relances: 0,
        signatures: 0,
        acomptes: 0,
        leadmagnets: 0,
        relances_total: 0,
        ca: 0,
        mrr: 0
      });
      continue;
    }

    // Compter les événements par type pour cette période
    const metrics = {
      leads_trouves: 0,
      leads_qualifies: 0,
      appels: 0,
      rdv: 0,
      devis: 0,
      relances: 0,
      signatures: 0,
      acomptes: 0,
      leadmagnets: 0,
      relances_total: 0,
      ca: 0,
      mrr: 0
    };

    // Compter les événements réels selon les vrais types d'événements du journal
    (journalData || []).forEach(entry => {
      const eventType = entry.type_evenement || '';
      
      // Pattern matching exact pour capturer tous les types d'événements du journal
      if (eventType === 'cold_call') {
        metrics.appels++;
      } else if (eventType.startsWith('relance_')) {
        // relance_1, relance_2, relance_3, relance_4, relance_5, relance_6
        metrics.relances++;
        metrics.relances_total++;
      } else if (eventType.startsWith('rdv_')) {
        // rdv_1, rdv_2
        metrics.rdv++;
      } else if (eventType === 'devis') {
        metrics.devis++;
      } else if (eventType === 'signature') {
        metrics.signatures++;
      } else if (eventType === 'deposit') {
        // deposit = acompte
        metrics.acomptes++;
      } else if (eventType === 'lead_magnet') {
        metrics.leadmagnets++;
      } else if (eventType === 'qualified') {
        // qualified = lead qualifié
        metrics.leads_qualifies++;
      }
      
      // Les montants CA et MRR peuvent être extraits de la description si nécessaire
      if (entry.description && (eventType.includes('ca') || eventType.includes('chiffre'))) {
        metrics.ca += extractAmountFromDescription(entry.description) || 0;
      }
      if (entry.description && eventType.includes('mrr')) {
        metrics.mrr += extractAmountFromDescription(entry.description) || 0;
      }
    });

    data.push({
      period_start: period.startDate.toISOString().split('T')[0],
      period_end: period.endDate.toISOString().split('T')[0],
      period_type: periodType,
      period_label: period.label,
      ...metrics
    });
  }
  
  return data;
}

// Fonction utilitaire pour extraire un montant d'une description
function extractAmountFromDescription(description: string | null): number {
  if (!description) return 0;
  
  // Chercher des patterns comme "1500€", "1 500 €", "1500 euros"
  const patterns = [
    /(\d+(?:\s?\d+)*)[€\s]*euros?/i,
    /(\d+(?:\s?\d+)*)\s*€/i,
    /(\d+(?:[\s,]\d+)*)/i
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const cleanNumber = match[1].replace(/\s/g, '').replace(/,/g, '');
      const amount = parseInt(cleanNumber);
      if (!isNaN(amount)) {
        return amount;
      }
    }
  }
  
  return 0;
}

function getPeriodColumnName(periodType: string): string {
  switch (periodType) {
    case 'week': return 'total_week';
    case 'month': return 'total_month';
    case 'quarter': return 'total_quarter';
    case 'year': return 'total_year';
    default: return 'total_month';
  }
}

function generatePeriodsForObjectives(type: string, count: number = 12) {
  const periods: any[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  
  switch (type) {
    case 'week':
      // Générer les 12 prochaines semaines
      for (let i = 0; i < count; i++) {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1 + (i * 7)); // Lundi
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Dimanche
        
        const weekNumber = getWeekNumberForObjectives(startOfWeek);
        
        periods.push({
          id: `week-${currentYear}-${weekNumber + i}`,
          type: 'week',
          label: `Semaine ${weekNumber + i}`,
          startDate: startOfWeek,
          endDate: endOfWeek,
          number: weekNumber + i
        });
      }
      break;
      
    case 'month':
      // Générer les 12 prochains mois
      for (let i = 0; i < count; i++) {
        const date = new Date(currentYear, now.getMonth() + i, 1);
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        periods.push({
          id: `month-${date.getFullYear()}-${date.getMonth() + 1}`,
          type: 'month',
          label: `${getMonthNameForObjectives(date.getMonth())} ${date.getFullYear()}`,
          startDate: startOfMonth,
          endDate: endOfMonth
        });
      }
      break;
      
    case 'quarter':
      // G��nérer les 8 prochains trimestres
      for (let i = 0; i < Math.min(count, 8); i++) {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const quarterIndex = (currentQuarter + i) % 4;
        const yearOffset = Math.floor((currentQuarter + i) / 4);
        const year = currentYear + yearOffset;
        
        const startMonth = quarterIndex * 3;
        const startOfQuarter = new Date(year, startMonth, 1);
        const endOfQuarter = new Date(year, startMonth + 3, 0);
        
        periods.push({
          id: `quarter-${year}-${quarterIndex + 1}`,
          type: 'quarter',
          label: `Q${quarterIndex + 1} ${year}`,
          startDate: startOfQuarter,
          endDate: endOfQuarter,
          number: quarterIndex + 1
        });
      }
      break;
      
    case 'year':
      // Générer les 5 prochaines années
      for (let i = 0; i < Math.min(count, 5); i++) {
        const year = currentYear + i;
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        periods.push({
          id: `year-${year}`,
          type: 'year',
          label: `${year}`,
          startDate: startOfYear,
          endDate: endOfYear
        });
      }
      break;
  }
  
  return periods;
}

function generateHistoricalPeriod(now: Date, periodType: string, index: number) {
  let startDate: Date, endDate: Date, label: string;
  
  switch (periodType) {
    case 'week':
      const weekDate = new Date(now);
      weekDate.setDate(now.getDate() - (index * 7));
      startDate = new Date(weekDate);
      startDate.setDate(weekDate.getDate() - weekDate.getDay() + 1);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      label = `S${getWeekNumberForObjectives(startDate)}`;
      break;
    case 'month':
      const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
      startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      label = `${getMonthNameForObjectives(monthDate.getMonth()).slice(0, 3)} ${monthDate.getFullYear().toString().slice(-2)}`;
      break;
    case 'quarter':
      const quarterDate = new Date(now);
      quarterDate.setMonth(now.getMonth() - (index * 3));
      const quarter = Math.floor(quarterDate.getMonth() / 3) + 1;
      startDate = new Date(quarterDate.getFullYear(), (quarter - 1) * 3, 1);
      endDate = new Date(quarterDate.getFullYear(), quarter * 3, 0);
      label = `Q${quarter} ${quarterDate.getFullYear().toString().slice(-2)}`;
      break;
    case 'year':
      const yearValue = now.getFullYear() - index;
      startDate = new Date(yearValue, 0, 1);
      endDate = new Date(yearValue, 11, 31);
      label = `${yearValue}`;
      break;
    default:
      startDate = new Date();
      endDate = new Date();
      label = 'Unknown';
  }
  
  return { startDate, endDate, label };
}

function getWeekNumberForObjectives(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getMonthNameForObjectives(month: number): string {
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return months[month];
}

// Fonction pour obtenir la période actuelle
function getCurrentPeriod(now: Date, periodType: string) {
  let startDate: Date, endDate: Date, label: string;
  
  switch (periodType) {
    case 'week':
      // Début de la semaine (lundi) et fin (dimanche)
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay() + 1);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      label = `Semaine ${getWeekNumberForObjectives(startDate)}`;
      break;
    case 'month':
      // Début et fin du mois actuel
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = `${getMonthNameForObjectives(now.getMonth())} ${now.getFullYear()}`;
      break;
    case 'quarter':
      // Début et fin du trimestre actuel
      const currentQuarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
      endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
      label = `Q${currentQuarter + 1} ${now.getFullYear()}`;
      break;
    case 'year':
      // Début et fin de l'année actuelle
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      label = `${now.getFullYear()}`;
      break;
    default:
      startDate = new Date();
      endDate = new Date();
      label = 'Période actuelle';
  }
  
  return { startDate, endDate, label };
}

// Fonction pour récupérer les données des dernières périodes
async function getRecentPeriodsDataFromJournal(periodType: string, count: number) {
  const data = [];
  const now = new Date();
  
  // Générer les périodes récentes (incluant la période actuelle)
  for (let i = 0; i < count; i++) {
    const period = generateHistoricalPeriod(now, periodType, i);
    
    // Requête pour obtenir les vraies données de cette période depuis le journal
    const { data: journalData, error } = await supabase
      .from('journal_succes')
      .select('type_evenement, description')
      .gte('date', period.startDate.toISOString())
      .lt('date', period.endDate.toISOString());

    if (error) {
      console.error('Erreur lors de la récupération du journal pour la période:', error);
    }

    // Compter les événements par type pour cette période
    const metrics = countEventsByType(journalData || []);

    data.push({
      period_start: period.startDate.toISOString().split('T')[0],
      period_end: period.endDate.toISOString().split('T')[0],
      period_type: periodType,
      period_label: period.label,
      ...metrics
    });
  }
  
  // Retourner dans l'ordre chronologique (plus ancien en premier)
  return data.reverse();
}

// Fonction utilitaire pour compter les événements par type
function countEventsByType(journalData: any[]) {
  const metrics = {
    leads_trouves: 0,
    leads_qualifies: 0,
    appels: 0,
    rdv: 0,
    devis: 0,
    relances: 0,
    signatures: 0,
    acomptes: 0,
    leadmagnets: 0,
    relances_total: 0,
    ca: 0,
    mrr: 0
  };

  // Compter les événements réels selon les vrais types d'événements du journal
  journalData.forEach(entry => {
    const eventType = entry.type_evenement || '';
    
    // Pattern matching exact pour capturer tous les types d'événements du journal
    if (eventType === 'cold_call') {
      metrics.appels++;
    } else if (eventType.startsWith('relance_')) {
      // relance_1, relance_2, relance_3, relance_4, relance_5, relance_6
      metrics.relances++;
      metrics.relances_total++;
    } else if (eventType.startsWith('rdv_')) {
      // rdv_1, rdv_2
      metrics.rdv++;
    } else if (eventType === 'devis') {
      metrics.devis++;
    } else if (eventType === 'signature') {
      metrics.signatures++;
    } else if (eventType === 'deposit') {
      // deposit = acompte
      metrics.acomptes++;
    } else if (eventType === 'lead_magnet') {
      metrics.leadmagnets++;
    } else if (eventType === 'qualified') {
      // qualified = lead qualifié
      metrics.leads_qualifies++;
    }
    // leads_trouves pourrait être calculé à partir de la création d'opportunités
  });

  return metrics;
}

// Start server
Deno.serve(app.fetch);