import type {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { AppDataSource } from '../db/data-source.js';

/**
 * Thin generic data-access wrapper. Modules get a typed repository per entity
 * and add domain-specific query methods in subclasses. Cross-module access goes
 * through services, never directly through another module's repository.
 */
export class BaseRepository<T extends ObjectLiteral> {
  protected readonly repo: Repository<T>;

  constructor(
    private readonly entity: new () => T,
    manager?: EntityManager,
  ) {
    this.repo = (manager ?? AppDataSource.manager).getRepository(entity);
  }

  /** Bind this repository to a transactional EntityManager. */
  withManager(manager: EntityManager): BaseRepository<T> {
    return new (this.constructor as new (e: new () => T, m?: EntityManager) => this)(
      this.entity,
      manager,
    );
  }

  create(data: DeepPartial<T>): T {
    return this.repo.create(data);
  }

  async save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save(entity);
  }

  async findById(id: string, options?: Omit<FindOneOptions<T>, 'where'>): Promise<T | null> {
    return this.repo.findOne({ ...options, where: { id } as unknown as FindOptionsWhere<T> });
  }

  async findOne(where: FindOptionsWhere<T>, options?: Omit<FindOneOptions<T>, 'where'>): Promise<T | null> {
    return this.repo.findOne({ ...options, where });
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find(options);
  }

  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    return this.repo.exists({ where });
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count(where ? { where } : undefined);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
