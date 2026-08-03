/**
 * @jest-environment node
 */
import { __resetServiceClientForTests } from "@/app/api/_lib/service-client";

const mockFrom = jest.fn();
const mockDispatchEvent = jest.fn();
const mockRunWorkflowAutomation = jest.fn();
const mockProcessSequenceEnrollment = jest.fn();
const mockHoldForMissingEmail = jest.fn();
const mockHoldForInvalidEmail = jest.fn();
const mockHoldForPendingVerification = jest.fn();
const mockEnqueueVerification = jest.fn();
const mockRecordSend = jest.fn();
const mockLoadDomainSendState = jest.fn();
const mockTripBounceGuard = jest.fn();

jest.mock("@/env", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: jest.fn() },
  })),
}));

jest.mock("@/lib/automations/dispatch", () => ({
  dispatchEvent: (...args: unknown[]) => mockDispatchEvent(...args),
}));

jest.mock("@/lib/automations/engine", () => ({
  runWorkflowAutomation: (...args: unknown[]) =>
    mockRunWorkflowAutomation(...args),
  processSequenceEnrollment: (...args: unknown[]) =>
    mockProcessSequenceEnrollment(...args),
  holdForMissingEmail: (...args: unknown[]) => mockHoldForMissingEmail(...args),
  holdForInvalidEmail: (...args: unknown[]) => mockHoldForInvalidEmail(...args),
  holdForPendingVerification: (...args: unknown[]) =>
    mockHoldForPendingVerification(...args),
}));

// Le service de vérification est mocké : ces tests portent sur le TRI de la
// file, pas sur le verdict lui-même (testé dans src/lib/email/verify).
jest.mock("@/lib/email/verify/service", () => ({
  ...jest.requireActual("@/lib/email/verify/service"),
  enqueueVerification: (...args: unknown[]) => mockEnqueueVerification(...args),
  recordSend: (...args: unknown[]) => mockRecordSend(...args),
  loadDomainSendState: (...args: unknown[]) => mockLoadDomainSendState(...args),
}));

jest.mock("@/lib/email/bounce-guard", () => ({
  ...jest.requireActual("@/lib/email/bounce-guard"),
  tripBounceGuard: (...args: unknown[]) => mockTripBounceGuard(...args),
}));

const ORIGINAL_ENV = { ...process.env };

const cronRequest = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/automations/tick", { headers });

const buildSelectChain = (result: { data: unknown; error?: unknown }) => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  in: jest.fn().mockResolvedValue(result),
  not: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(result),
  maybeSingle: jest.fn().mockResolvedValue(result),
});

const buildUpdateChain = () => {
  const captured: { updates: unknown[]; ids: unknown[] } = {
    updates: [],
    ids: [],
  };
  const chain = {
    update: jest.fn().mockImplementation((u: unknown) => {
      captured.updates.push(u);
      return chain;
    }),
    eq: jest.fn().mockImplementation((_col: string, val: unknown) => {
      captured.ids.push(val);
      return Promise.resolve({ error: null });
    }),
    captured,
  };
  return chain;
};

/**
 * Rien à faire : le fallback de `mockFrom` (posé dans beforeEach) rend déjà une
 * chaîne vide pour n'importe quelle table. Conservé pour la lisibilité des
 * tests qui veulent dire explicitement « le CRM est au repos ».
 */
const emptyAll = () => {};

describe("GET /api/automations/tick", () => {
  beforeEach(() => {
    __resetServiceClientForTests();
    mockFrom.mockReset();
    // Fallback : toute table non explicitement mockée rend un résultat vide.
    // Les tests ci-dessous n'ont donc à décrire QUE les requêtes qui les
    // concernent — les lectures du régulateur ne les font pas dérailler.
    mockFrom.mockImplementation(() =>
      buildSelectChain({ data: [], error: null }),
    );
    mockDispatchEvent.mockReset();
    mockRunWorkflowAutomation.mockReset();
    mockProcessSequenceEnrollment.mockReset();
    mockHoldForMissingEmail.mockReset();
    mockHoldForMissingEmail.mockResolvedValue(undefined);
    for (const fn of [
      mockHoldForInvalidEmail,
      mockHoldForPendingVerification,
      mockEnqueueVerification,
      mockRecordSend,
    ]) {
      fn.mockReset();
      fn.mockResolvedValue(undefined);
    }
    mockLoadDomainSendState.mockReset();
    mockLoadDomainSendState.mockResolvedValue(new Map());
    mockTripBounceGuard.mockReset();
    // Par défaut le disjoncteur est au repos : les tests de file portent sur le
    // tri, pas sur lui (il a sa propre suite dans src/lib/email).
    mockTripBounceGuard.mockResolvedValue({ tripped: false });
    process.env = { ...ORIGINAL_ENV };
    delete process.env.CRON_SECRET;
    delete process.env.PG_CRON_SECRET;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const importRoute = async () => {
    jest.resetModules();
    return await import("../route");
  };

  describe("auth", () => {
    it("rejects with 401 in production when CRON_SECRET is unset (fail-closed)", async () => {
      process.env.NODE_ENV = "production";
      const { GET } = await importRoute();
      const res = await GET(cronRequest());
      expect(res.status).toBe(401);
    });

    it("rejects with 401 when secrets configured but header mismatched", async () => {
      process.env.CRON_SECRET = "shh";
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ authorization: "Bearer wrong" }));
      expect(res.status).toBe(401);
    });

    it("accepts a valid Vercel Bearer secret", async () => {
      process.env.CRON_SECRET = "shh";
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ authorization: "Bearer shh" }));
      expect(res.status).toBe(200);
    });

    it("accepts a valid pg_cron secret header", async () => {
      process.env.PG_CRON_SECRET = "pg-shh";
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest({ "x-pg-cron-secret": "pg-shh" }));
      expect(res.status).toBe(200);
    });

    it("allows in dev when no secrets configured", async () => {
      emptyAll();
      const { GET } = await importRoute();
      const res = await GET(cronRequest());
      expect(res.status).toBe(200);
    });
  });

  describe("event-job processing", () => {
    it("marks a job done on successful dispatch", async () => {
      const eventJobs = [
        {
          id: "ej-1",
          job_type: "scheduled_trigger",
          payload: { event: "x" },
          attempts: 0,
        },
      ];
      const markProcessing = buildUpdateChain();
      const markDone = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null })) // fetch event jobs
        .mockReturnValueOnce(markProcessing) // mark processing
        .mockReturnValueOnce(markDone) // mark done
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null })) // wf jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null })); // enrollments fetch

      mockDispatchEvent.mockResolvedValueOnce(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());

      expect(res.status).toBe(200);
      expect(markProcessing.captured.updates).toEqual([
        { status: "processing" },
      ]);
      expect(markDone.captured.updates).toEqual([{ status: "done" }]);
    });

    it("on transient error: increments attempts, keeps pending for retry", async () => {
      const eventJobs = [
        {
          id: "ej-1",
          job_type: "scheduled_trigger",
          payload: { event: "x" },
          attempts: 0,
        },
      ];
      const markProcessing = buildUpdateChain();
      const markRetry = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(markRetry)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent.mockRejectedValueOnce(new Error("upstream down"));

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markRetry.captured.updates).toEqual([
        expect.objectContaining({
          status: "pending",
          attempts: 1,
          last_error: expect.stringContaining("upstream down"),
        }),
      ]);
    });

    it("after MAX_ATTEMPTS-1 prior failures: marks error (terminal)", async () => {
      const eventJobs = [
        {
          id: "ej-1",
          job_type: "scheduled_trigger",
          payload: { event: "x" },
          attempts: 2,
        },
      ];
      const markProcessing = buildUpdateChain();
      const markFailed = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(markFailed)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent.mockRejectedValueOnce(new Error("still down"));

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markFailed.captured.updates).toEqual([
        expect.objectContaining({
          status: "error",
          attempts: 3,
          last_error: expect.stringContaining("still down"),
        }),
      ]);
    });

    it("one failing job does not poison the batch", async () => {
      const eventJobs = [
        { id: "ej-1", job_type: "scheduled_trigger", payload: {}, attempts: 0 },
        { id: "ej-2", job_type: "scheduled_trigger", payload: {}, attempts: 0 },
      ];
      const markProcessing1 = buildUpdateChain();
      const markRetry1 = buildUpdateChain();
      const markProcessing2 = buildUpdateChain();
      const markDone2 = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: eventJobs, error: null }))
        .mockReturnValueOnce(markProcessing1)
        .mockReturnValueOnce(markRetry1)
        .mockReturnValueOnce(markProcessing2)
        .mockReturnValueOnce(markDone2)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }))
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null }));

      mockDispatchEvent
        .mockRejectedValueOnce(new Error("first fails"))
        .mockResolvedValueOnce(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.events).toBe(1);
      expect(body.errors).toBe(1);
      expect(markDone2.captured.updates).toEqual([{ status: "done" }]);
    });
  });

  /**
   * Le ticker n'envoie plus « dès que next_run_at est passé » : les emails
   * passent par la file du régulateur. On vérifie les trois issues possibles —
   * ça part, c'est planifié pour plus tard, c'est bloqué — ainsi que le
   * court-circuit des étapes manuelles, qui ne passent jamais par la file.
   */
  describe("file du régulateur", () => {
    /** Plages ouvertes 24 h/24 et week-end autorisé : le test ne dépend pas de l'heure. */
    const openRegulator = (over: Record<string, unknown> = {}) => ({
      id: "global",
      gap_min_minutes: 7,
      gap_max_minutes: 14,
      daily_cap: 120,
      company_gap_minutes: 0,
      paused: false,
      count_all_sequences: true,
      one_per_day_per_contact: false,
      exit_on_reply: true,
      business_days_only: false,
      default_windows: [[0, 1440]],
      timezone: "Europe/Paris",
      task_routing_mode: "pref",
      task_max_per_agent: 8,
      admin_user_id: null,
      ...over,
    });

    const enrollment = (over: Record<string, unknown> = {}) => ({
      id: "enr-1",
      automation_id: "auto-1",
      contact_id: "c-1",
      entreprise_id: 7,
      opportunite_id: null,
      current_step: 0,
      status: "active",
      next_run_at: new Date(Date.now() - 60_000).toISOString(),
      entered_at: new Date(Date.now() - 3_600_000).toISOString(),
      vars: {},
      ...over,
    });

    const sequence = (kind: string) => ({
      id: "auto-1",
      kind: "sequence",
      name: "Artisans — première approche",
      status: "on",
      definition: { steps: [{ id: "st-1", kind, day: 0, template: "tpl-1" }] },
      settings: { sendWindows: [[0, 1440]], queuePriority: 1 },
    });

    /** Chaîne qui sait à la fois lire et capturer les update() d'une table. */
    const rwChain = (result: { data: unknown; error?: unknown }) => {
      const captured: Record<string, unknown>[] = [];
      const chain = buildSelectChain(result) as Record<string, unknown> & {
        captured: Record<string, unknown>[];
      };
      chain.captured = captured;
      chain.update = jest.fn((u: Record<string, unknown>) => {
        captured.push(u);
        return { eq: jest.fn().mockResolvedValue({ error: null }) };
      });
      return chain;
    };

    const wire = (opts: {
      regulator?: Record<string, unknown>;
      enrollments: Record<string, unknown>[];
      automations: Record<string, unknown>[];
      emailLogs?: Record<string, unknown>[];
      /** Adresses connues du contact / de l'entreprise. `null` = aucune. */
      contacts?: Record<string, unknown>[] | null;
      entreprises?: Record<string, unknown>[] | null;
      /** Verdicts de vérification, tels qu'ils sortiraient de la base. */
      verifications?: Record<string, unknown>[];
      suppressions?: Record<string, unknown>[];
    }) => {
      const enrollmentsChain = rwChain({ data: opts.enrollments, error: null });
      // Par défaut le contact a une adresse : sans elle, le régulateur écarte
      // l'inscription de la file au lieu de la planifier.
      const contacts =
        opts.contacts === undefined
          ? [{ id: "c-1", email: "jean@garage.fr" }]
          : (opts.contacts ?? []);
      const entreprises = opts.entreprises ?? [];
      mockFrom.mockImplementation((table: string) => {
        if (table === "regulator_settings") {
          return buildSelectChain({
            data: opts.regulator ?? openRegulator(),
            error: null,
          });
        }
        if (table === "sequence_enrollments") return enrollmentsChain;
        if (table === "automations")
          return buildSelectChain({ data: opts.automations, error: null });
        if (table === "email_logs")
          return buildSelectChain({ data: opts.emailLogs ?? [], error: null });
        if (table === "contacts")
          return buildSelectChain({ data: contacts, error: null });
        if (table === "entreprises")
          return buildSelectChain({ data: entreprises, error: null });
        if (table === "email_verifications") {
          return buildSelectChain({
            data: opts.verifications ?? [],
            error: null,
          });
        }
        if (table === "email_suppressions") {
          return buildSelectChain({
            data: opts.suppressions ?? [],
            error: null,
          });
        }
        return buildSelectChain({ data: [], error: null });
      });
      return enrollmentsChain;
    };

    it("envoie l’email dû quand la file lui donne le feu vert", async () => {
      wire({ enrollments: [enrollment()], automations: [sequence("email")] });
      mockProcessSequenceEnrollment.mockResolvedValue(undefined);

      const { GET } = await importRoute();
      const res = await GET(cronRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(mockProcessSequenceEnrollment).toHaveBeenCalledTimes(1);
      expect(mockProcessSequenceEnrollment.mock.calls[0]).toHaveLength(1); // plus de throttle
      expect(body.emailsSent).toBe(1);
    });

    it("planifie sans envoyer quand le créneau n’est pas encore atteint", async () => {
      // Un email vient de partir : le suivant doit attendre l'écart minimum.
      const chain = wire({
        enrollments: [enrollment()],
        automations: [sequence("email")],
        emailLogs: [
          {
            id: "log-1",
            sent_at: new Date().toISOString(),
            contact_id: "other",
            entreprise_id: 99,
            automation_id: "auto-1",
            to_name: null,
            subject: "x",
            type: "sequence",
          },
        ],
      });

      const { GET } = await importRoute();
      const body = await (await GET(cronRequest())).json();

      expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
      expect(body.emailsQueued).toBe(1);
      expect(chain.captured[0]).toEqual(
        expect.objectContaining({ send_at: expect.any(String) }),
      );
    });

    it("gèle la file et journalise le motif quand le régulateur est en pause", async () => {
      const chain = wire({
        regulator: openRegulator({ paused: true }),
        enrollments: [enrollment()],
        automations: [sequence("email")],
      });

      const { GET } = await importRoute();
      const body = await (await GET(cronRequest())).json();

      expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
      expect(body.emailsBlocked).toBe(1);
      expect(body.regulatorPaused).toBe(true);
      expect(chain.captured[0]).toEqual({
        send_at: null,
        hold_reason: "global_pause",
      });
    });

    it("n’entre pas dans la file quand aucune adresse n’est connue", async () => {
      wire({
        enrollments: [enrollment()],
        automations: [sequence("email")],
        contacts: [{ id: "c-1", email: null }],
        entreprises: [{ id: 7, email: "" }],
      });

      const { GET } = await importRoute();
      const body = await (await GET(cronRequest())).json();

      expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
      expect(mockHoldForMissingEmail).toHaveBeenCalledWith(
        expect.anything(),
        "enr-1",
      );
      expect(body.emailsNoAddress).toBe(1);
      expect(body.emailsQueued).toBe(0);
      expect(body.emailsSent).toBe(0);
    });

    it("accepte l’adresse de la fiche entreprise comme destinataire de repli", async () => {
      wire({
        enrollments: [enrollment()],
        automations: [sequence("email")],
        contacts: [{ id: "c-1", email: null }],
        entreprises: [{ id: 7, email: "contact@garage.fr" }],
      });
      mockProcessSequenceEnrollment.mockResolvedValue(undefined);

      const { GET } = await importRoute();
      const body = await (await GET(cronRequest())).json();

      expect(mockHoldForMissingEmail).not.toHaveBeenCalled();
      expect(body.emailsSent).toBe(1);
    });

    it("exécute les étapes manuelles sans passer par la file", async () => {
      wire({
        regulator: openRegulator({ paused: true }),
        enrollments: [enrollment()],
        automations: [sequence("whatsapp")],
      });
      mockProcessSequenceEnrollment.mockResolvedValue(undefined);

      const { GET } = await importRoute();
      const body = await (await GET(cronRequest())).json();

      // Le régulateur est en pause, et pourtant la tâche WhatsApp est créée :
      // la pause ne concerne que les envois automatiques.
      expect(mockProcessSequenceEnrollment).toHaveBeenCalledTimes(1);
      expect(body.sequenceSteps).toBe(1);
      expect(body.emailsBlocked).toBe(0);
    });

    it("ne consulte pas l’historique d’envoi quand aucune inscription n’est due", async () => {
      emptyAll();
      const { GET } = await importRoute();
      await GET(cronRequest());
      expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain("email_logs");
    });

    /**
     * Le tri par vérification d’adresse. Il se fait AVANT toute préparation :
     * une inscription écartée ici n’a rien envoyé et n’a rien franchi. C’est la
     * garantie qu’un prospect ne « consomme » pas un email qui n’est jamais parti.
     */
    describe("vérification des adresses", () => {
      const soon = () => new Date(Date.now() + 86_400_000).toISOString();
      const past = () => new Date(Date.now() - 86_400_000).toISOString();

      const guarded = (over: Record<string, unknown> = {}) =>
        openRegulator({ verify_before_send: true, ...over });

      const verdict = (over: Record<string, unknown> = {}) => ({
        email: "jean@garage.fr",
        status: "valid",
        sub_status: "mx_ok",
        score: 80,
        suggestion: null,
        checked_at: past(),
        expires_at: soon(),
        details: { reason: "domaine joignable" },
        ...over,
      });

      it("gèle une inscription dont l’adresse ne recevra pas", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [
            verdict({ status: "invalid", sub_status: "domaine_mort" }),
          ],
        });

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        // Rien de préparé, rien d’envoyé, rien d’avancé : l’inscription attend
        // qu’on corrige l’adresse.
        expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
        expect(mockHoldForInvalidEmail).toHaveBeenCalledWith(
          expect.anything(),
          "enr-1",
        );
        expect(body.emailsInvalid).toBe(1);
        expect(body.emailsSent).toBe(0);
      });

      it("gèle une adresse jamais vérifiée et la met en file de vérification", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [],
        });

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
        expect(mockHoldForPendingVerification).toHaveBeenCalledWith(
          expect.anything(),
          "enr-1",
        );
        // Sans cette inscription en file, le blocage serait définitif : c’est ce
        // qui rend l’attente auto-résolutive.
        expect(mockEnqueueVerification).toHaveBeenCalledWith(
          expect.anything(),
          "jean@garage.fr",
        );
        expect(body.emailsUnverified).toBe(1);
      });

      it("gèle une adresse dont le verdict a expiré", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [verdict({ expires_at: past() })],
        });

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();
        expect(body.emailsUnverified).toBe(1);
      });

      it("envoie normalement vers une adresse au verdict frais", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [verdict()],
        });
        mockProcessSequenceEnrollment.mockResolvedValue(undefined);

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        expect(body.emailsSent).toBe(1);
        expect(mockHoldForInvalidEmail).not.toHaveBeenCalled();
        expect(mockHoldForPendingVerification).not.toHaveBeenCalled();
      });

      it("laisse partir une adresse douteuse — le quota se joue dans la file", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [verdict({ status: "risky", sub_status: "sans_mx" })],
        });
        mockProcessSequenceEnrollment.mockResolvedValue(undefined);

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();
        expect(body.emailsSent).toBe(1);
      });

      it("ne bloque rien quand le garde est coupé", async () => {
        // Réglage absent ou désactivé : on retrouve exactement le comportement
        // d’avant, même sans le moindre verdict en base.
        wire({
          regulator: openRegulator({ verify_before_send: false }),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [],
        });
        mockProcessSequenceEnrollment.mockResolvedValue(undefined);

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        expect(body.emailsSent).toBe(1);
        expect(body.emailsUnverified).toBe(0);
      });

      it("bloque une adresse supprimée, même avec un verdict valide", async () => {
        wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [verdict()],
          suppressions: [{ email: "jean@garage.fr", reason: "unsubscribe" }],
        });

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        // La suppression est une décision, pas une mesure : elle prime sur tout.
        expect(body.emailsInvalid).toBe(1);
        expect(body.emailsSent).toBe(0);
      });

      it("gèle la file quand le disjoncteur vient de couper", async () => {
        mockTripBounceGuard.mockResolvedValue({
          tripped: true,
          detail: "12 rebonds durs sur 200 envois en 24 h",
        });
        const chain = wire({
          regulator: guarded(),
          enrollments: [enrollment()],
          automations: [sequence("email")],
          verifications: [verdict()],
        });

        const { GET } = await importRoute();
        const body = await (await GET(cronRequest())).json();

        // Le tick courant s’abstient d’envoyer : sans ça, les emails de CETTE
        // minute partiraient malgré la coupure.
        expect(mockProcessSequenceEnrollment).not.toHaveBeenCalled();
        expect(body.emailsSent).toBe(0);
        expect(body.bounceGuardTripped).toContain("12 rebonds durs");
        expect(chain.captured).toContainEqual({
          send_at: null,
          hold_reason: "global_pause",
        });
      });

      it("ne consulte pas le disjoncteur quand rien n’est à envoyer", async () => {
        // Un tick au repos repasse toutes les minutes : il doit rester gratuit.
        emptyAll();
        const { GET } = await importRoute();
        await GET(cronRequest());
        expect(mockTripBounceGuard).not.toHaveBeenCalled();
      });
    });
  });

  describe("workflow-job processing", () => {
    it("on transient error: increments attempts, keeps pending for retry", async () => {
      const wfJobs = [
        {
          id: "wf-1",
          job_type: "workflow_node",
          payload: { node_id: "n1", context: {} },
          automation_id: "auto-1",
          run_id: "run-1",
          attempts: 0,
        },
      ];
      const markProcessing = buildUpdateChain();
      const markRetry = buildUpdateChain();

      mockFrom
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null })) // event jobs fetch
        .mockReturnValueOnce(buildSelectChain({ data: wfJobs, error: null })) // wf jobs fetch
        .mockReturnValueOnce(markProcessing)
        .mockReturnValueOnce(
          buildSelectChain({ data: { id: "auto-1" }, error: null }),
        ) // auto lookup
        .mockReturnValueOnce(markRetry)
        .mockReturnValueOnce(buildSelectChain({ data: [], error: null })); // enrollments fetch

      mockRunWorkflowAutomation.mockRejectedValueOnce(
        new Error("node crashed"),
      );

      const { GET } = await importRoute();
      await GET(cronRequest());

      expect(markRetry.captured.updates).toEqual([
        expect.objectContaining({
          status: "pending",
          attempts: 1,
          last_error: expect.stringContaining("node crashed"),
        }),
      ]);
    });
  });
});
