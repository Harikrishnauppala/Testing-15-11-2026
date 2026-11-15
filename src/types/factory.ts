export type Allergen =
  | 'Wheat'
  | 'Milk'
  | 'Egg'
  | 'Soy'
  | 'Tree Nuts'
  | 'Peanuts'
  | 'Sesame'
  | 'Fish'
  | 'Shellfish'
  | 'Sulfites';

export type RecipeStatus = 'Approved' | 'R&D Trial' | 'Archived';

export type ProductLine =
  | 'Millet Cookies'
  | 'Millet Biscuits'
  | 'Millet Muffins'
  | 'Ready-to-Eat Snacks'
  | 'Gluten-Free & R&D';

export type QaStatus = 'Passed' | 'Pending QA' | 'Hold';

export interface NutritionPer100g {
  calories: number;
  proteinG: number;
  fatG: number;
  satFatG: number;
  carbsG: number;
  sugarsG: number;
  fiberG: number;
  sodiumMg: number;
}

export interface IngredientSupplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  leadTimeDays: number;
  isPrimary?: boolean;
}

export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  suppliers: IngredientSupplier[];
  costPerKg: number;
  stockKg: number;
  reorderPointKg: number;
  shelfLifeDays: number;
  allergens: Allergen[];
  nutritionPer100g: NutritionPer100g;
}

export interface BomLine {
  id: string;
  ingredientId: string;
  stage: string;
  quantityKg: number;
  processLossPct: number;
  lotNote: string;
}

export interface ProcessStep {
  id: string;
  stepNumber: number;
  stage: string;
  title: string;
  equipment: string;
  targetTempC: number | null;
  durationMin: number;
  speedOrSetting: string;
  ccpNote: string;
  isCcp: boolean;
}

export interface RecipeRevision {
  version: string;
  date: string;
  author: string;
  notes: string;
  snapshotTotalKg: number;
  snapshotCostPerKg: number;
  yieldPctSnapshot?: number;
  bomSnapshot?: BomLine[];
  stepsSnapshot?: ProcessStep[];
}

export interface Recipe {
  id: string;
  code: string;
  name: string;
  productLine: ProductLine;
  status: RecipeStatus;
  version: string;
  yieldPct: number;
  unitWeightG: number;
  targetBatchKg: number;
  shelfLifeDays: number;
  storageTemp: string;
  imageUrl?: string;
  notes: string;
  bom: BomLine[];
  steps: ProcessStep[];
  revisions: RecipeRevision[];
  updatedAt: string;
}

export interface ConsumedLot {
  ingredientId: string;
  ingredientSku: string;
  ingredientName: string;
  requiredKg: number;
  lotNumber: string;
}

export interface BatchCcpStepLog {
  stepId: string;
  stepNumber: number;
  title: string;
  stage: string;
  allottedMin: number;
  actualMin: number | null;
  startedAt?: string;
  completedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  correctiveAction?: string;
}

export interface ProductionBatch {
  id: string;
  lotCode: string;
  recipeId: string;
  recipeCode: string;
  recipeName: string;
  version: string;
  lineName: string;
  targetOutputKg: number;
  actualOutputKg: number;
  multiplier: number;
  operator: string;
  qaStatus: QaStatus;
  runStatus?: 'Completed' | 'Scheduled';
  startedAt: string;
  notes: string;
  consumedLots: ConsumedLot[];
  ccpStepLogs?: BatchCcpStepLog[];
}

export type MachineCategory =
  | 'Milling & Grinding'
  | 'Mixing & Blending'
  | 'Forming & Depositing'
  | 'Baking & Thermal'
  | 'Packaging & Sealing'
  | 'Other';

export type MachineStatus = 'Operational' | 'Maintenance' | 'Standby';

export interface PlantMachine {
  id: string;
  code: string;
  name: string;
  category: MachineCategory;
  stageRole: string;
  capacitySpec: string;
  defaultSetting: string;
  defaultTempC: number | null;
  status: MachineStatus;
  notes: string;
}

export type MaintenancePriority = 'Routine' | 'Critical' | 'Calibration';

export type MaintenanceTaskStatus = 'Scheduled' | 'Completed';

export interface MaintenanceTask {
  id: string;
  machineId: string;
  machineCode: string;
  machineName: string;
  title: string;
  taskType: MaintenancePriority;
  scheduledDate: string;
  intervalDays: number;
  technician: string;
  status: MaintenanceTaskStatus;
  completedDate?: string;
  notes: string;
}

export interface FactoryDatabase {
  seedVersion?: string;
  resourceSeeded?: boolean;
  factoryName: string;
  plantCode: string;
  recipes: Recipe[];
  ingredients: Ingredient[];
  batches: ProductionBatch[];
  machines?: PlantMachine[];
  maintenanceTasks?: MaintenanceTask[];
}

export interface WorkerBatchSheetItem {
  seq: number;
  sku: string;
  materialName: string;
  requiredKg: number;
  lotNumber: string;
}

export interface WorkerMakingStepInput {
  materialName: string;
  requiredKg: number;
}

export interface WorkerMakingStep {
  stepNumber: number;
  stage: string;
  actionTitle: string;
  equipment: string;
  durationMin: number;
  targetTempC: number | null;
  speedOrSetting: string;
  checkNote: string;
  isCcp: boolean;
  addMaterials: WorkerMakingStepInput[];
}

export interface WorkerBatchSheetPayload {
  batchId?: string;
  lotCode: string;
  factoryName: string;
  plantCode: string;
  lineName: string;
  startedAt: string;
  qaStatus: QaStatus;
  totalWeighKg: number;
  itemCount: number;
  operator: string;
  notes: string;
  items: WorkerBatchSheetItem[];
  makingSteps?: WorkerMakingStep[];
}

export type WorkspaceView = 'formulations' | 'scaler' | 'ingredients' | 'machines' | 'batches';
