import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import type { Choreography } from "../types/choreography";
import { db } from "./firebaseClient";

export const loadCloudProjects = async (userId: string): Promise<Choreography[]> => {
  if (!db) throw new Error("Firebase is not configured.");
  const snapshot = await getDocs(query(collection(db, "users", userId, "projects"), orderBy("updatedAt", "desc")));
  return snapshot.docs.map((item) => item.data().data as Choreography).filter(Boolean);
};

export const saveCloudProject = async (userId: string, project: Choreography) => {
  if (!db) throw new Error("Firebase is not configured.");
  await setDoc(doc(db, "users", userId, "projects", project.id), {
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    data: project,
  });
};

export const deleteCloudProject = async (userId: string, projectId: string) => {
  if (!db) throw new Error("Firebase is not configured.");
  await deleteDoc(doc(db, "users", userId, "projects", projectId));
};
