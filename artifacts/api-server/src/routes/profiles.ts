import { Router, type Request, type Response } from "express";
import { db, profilesTable, insertProfileSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/profiles", async (req: Request, res: Response) => {
  try {
    const profiles = await db.select().from(profilesTable);
    res.json(profiles);
  } catch (error) {
    console.error("Error fetching profiles:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profiles", async (req: Request, res: Response) => {
  try {
    const validatedData = insertProfileSchema.parse(req.body);
    const [newProfile] = await db.insert(profilesTable).values(validatedData).returning();
    res.status(201).json(newProfile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error("Error creating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.patch("/profiles/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // We use a partial schema for updates
    const updateSchema = insertProfileSchema.partial();
    const validatedData = updateSchema.parse(req.body);
    
    const [updatedProfile] = await db
      .update(profilesTable)
      .set(validatedData)
      .where(eq(profilesTable.id, id as string))
      .returning();

    if (!updatedProfile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.json(updatedProfile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.delete("/profiles/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(profilesTable).where(eq(profilesTable.id, id as string));
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
