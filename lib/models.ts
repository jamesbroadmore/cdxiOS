import mongoose, { Schema, Document } from 'mongoose';

// User schema
export interface IUser extends Document {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'user' | 'agency_owner';
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    email: { type: String, unique: true, required: true, lowercase: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, default: '' },
    role: { type: String, enum: ['admin', 'user', 'agency_owner'], default: 'user' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Client schema
export interface IClient extends Document {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  status: 'active' | 'inactive' | 'prospect';
  notes: string;
  created_at: Date;
  updated_at: Date;
}

const clientSchema = new Schema<IClient>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    company: { type: String, default: '' },
    industry: { type: String, default: '' },
    status: { type: String, enum: ['active', 'inactive', 'prospect'], default: 'prospect' },
    notes: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Contact schema
export interface IContact extends Document {
  id: string;
  client_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

const contactSchema = new Schema<IContact>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    client_id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Project schema
export interface IProject extends Document {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  description: string;
  status: 'planning' | 'in_progress' | 'completed' | 'paused';
  budget: number;
  start_date: Date | null;
  end_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const projectSchema = new Schema<IProject>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true },
    client_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['planning', 'in_progress', 'completed', 'paused'], default: 'planning' },
    budget: { type: Number, default: 0 },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Task schema
export interface ITask extends Document {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const taskSchema = new Schema<ITask>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    project_id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    due_date: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Milestone schema
export interface IMilestone extends Document {
  id: string;
  project_id: string;
  name: string;
  description: string;
  status: 'pending' | 'completed';
  due_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

const milestoneSchema = new Schema<IMilestone>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    project_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    due_date: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Agent schema
export interface IAgent extends Document {
  id: string;
  name: string;
  role: string;
  description: string;
  model: string;
  system_prompt: string;
  tools: string[];
  created_at: Date;
  updated_at: Date;
}

const agentSchema = new Schema<IAgent>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    name: { type: String, required: true },
    role: { type: String, required: true },
    description: { type: String, default: '' },
    model: { type: String, default: 'claude-3-5-sonnet-20241022' },
    system_prompt: { type: String, required: true },
    tools: [String],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Conversation schema
export interface IConversation extends Document {
  id: string;
  user_id: string;
  agent_id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  created_at: Date;
  updated_at: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true },
    agent_id: { type: String, required: true },
    title: { type: String, required: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Invoice schema
export interface IInvoice extends Document {
  id: string;
  user_id: string;
  client_id: string;
  project_id: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  invoice_date: Date;
  due_date: Date;
  stripe_payment_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    id: { type: String, unique: true, required: true, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true },
    client_id: { type: String, required: true },
    project_id: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft' },
    invoice_date: { type: Date, default: Date.now },
    due_date: { type: Date, required: true },
    stripe_payment_id: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Export or create models
export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
export const Client = mongoose.models.Client || mongoose.model<IClient>('Client', clientSchema);
export const Contact = mongoose.models.Contact || mongoose.model<IContact>('Contact', contactSchema);
export const Project = mongoose.models.Project || mongoose.model<IProject>('Project', projectSchema);
export const Task = mongoose.models.Task || mongoose.model<ITask>('Task', taskSchema);
export const Milestone = mongoose.models.Milestone || mongoose.model<IMilestone>('Milestone', milestoneSchema);
export const Agent = mongoose.models.Agent || mongoose.model<IAgent>('Agent', agentSchema);
export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', conversationSchema);
export const Invoice = mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', invoiceSchema);
