"use client";

import { authedFetch } from "@/utils/authedFetch";
import type {
  PlancheBoard,
  PlancheBoardSummary,
  PlancheCard,
  PlancheCardContent,
  PlancheCardStyle,
  PlancheCardType,
  PlancheConnection,
} from "@/types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const planchesApi = {
  async listBoards(): Promise<PlancheBoardSummary[]> {
    const res = await authedFetch("/api/planches");
    const data = await jsonOrThrow<{ boards: PlancheBoardSummary[] }>(res);
    return data.boards;
  },

  async createBoard(input: {
    title?: string;
    parent_board_id?: string | null;
    parent_card_id?: string | null;
  }): Promise<PlancheBoardSummary> {
    const res = await authedFetch("/api/planches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await jsonOrThrow<{ board: PlancheBoardSummary }>(res);
    return data.board;
  },

  async getBoard(id: string): Promise<{
    board: PlancheBoard;
    cards: PlancheCard[];
    connections: PlancheConnection[];
    breadcrumb: Pick<PlancheBoard, "id" | "title">[];
  }> {
    const res = await authedFetch(`/api/planches/${id}`);
    return jsonOrThrow(res);
  },

  async updateBoard(
    id: string,
    patch: { title?: string; icon?: string | null; color?: string | null },
  ): Promise<PlancheBoard> {
    const res = await authedFetch(`/api/planches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await jsonOrThrow<{ board: PlancheBoard }>(res);
    return data.board;
  },

  async deleteBoard(id: string): Promise<void> {
    const res = await authedFetch(`/api/planches/${id}`, { method: "DELETE" });
    await jsonOrThrow(res);
  },

  async createCard(
    boardId: string,
    input: {
      type: PlancheCardType;
      position_x?: number;
      position_y?: number;
      width?: number;
      height?: number | null;
      z_index?: number;
      content?: PlancheCardContent;
      style?: PlancheCardStyle;
      parent_card_id?: string | null;
      sort_order?: number;
    },
  ): Promise<PlancheCard> {
    const res = await authedFetch(`/api/planches/${boardId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await jsonOrThrow<{ card: PlancheCard }>(res);
    return data.card;
  },

  async updateCard(cardId: string, patch: Partial<PlancheCard>): Promise<PlancheCard> {
    const res = await authedFetch(`/api/planches/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await jsonOrThrow<{ card: PlancheCard }>(res);
    return data.card;
  },

  async bulkUpdateCards(
    boardId: string,
    cards: Array<Partial<PlancheCard> & { id: string }>,
  ): Promise<void> {
    const res = await authedFetch(`/api/planches/${boardId}/cards`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards }),
    });
    await jsonOrThrow(res);
  },

  async deleteCard(cardId: string): Promise<void> {
    const res = await authedFetch(`/api/planches/cards/${cardId}`, { method: "DELETE" });
    await jsonOrThrow(res);
  },

  async uploadFiles(
    boardId: string,
    files: File[],
    at: { x: number; y: number; z?: number },
  ): Promise<{ cards: PlancheCard[]; failures: { file_name: string; error: string }[] }> {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("x", String(Math.round(at.x)));
    form.append("y", String(Math.round(at.y)));
    if (at.z !== undefined) form.append("z", String(at.z));
    const res = await authedFetch(`/api/planches/${boardId}/upload`, {
      method: "POST",
      body: form,
    });
    return jsonOrThrow(res);
  },

  async createConnection(
    boardId: string,
    fromCardId: string,
    toCardId: string,
  ): Promise<PlancheConnection> {
    const res = await authedFetch(`/api/planches/${boardId}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_card_id: fromCardId, to_card_id: toCardId }),
    });
    const data = await jsonOrThrow<{ connection: PlancheConnection }>(res);
    return data.connection;
  },

  async deleteConnection(connId: string): Promise<void> {
    const res = await authedFetch(`/api/planches/connections/${connId}`, { method: "DELETE" });
    await jsonOrThrow(res);
  },
};
