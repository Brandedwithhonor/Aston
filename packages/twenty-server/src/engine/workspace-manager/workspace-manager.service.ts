import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import isEmpty from 'lodash.isempty';
import { Repository } from 'typeorm';

import { UserWorkspace } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { DataSourceEntity } from 'src/engine/metadata-modules/data-source/data-source.entity';
import { DataSourceService } from 'src/engine/metadata-modules/data-source/data-source.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { RelationMetadataEntity } from 'src/engine/metadata-modules/relation-metadata/relation-metadata.entity';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkspaceMigrationService } from 'src/engine/metadata-modules/workspace-migration/workspace-migration.service';
import { PETS_DATA_SEEDS } from 'src/engine/seeder/data-seeds/pets-data-seeds';
import { SURVEY_RESULTS_DATA_SEEDS } from 'src/engine/seeder/data-seeds/survey-results-data-seeds';
import { PETS_METADATA_SEEDS } from 'src/engine/seeder/metadata-seeds/pets-metadata-seeds';
import { SURVEY_RESULTS_METADATA_SEEDS } from 'src/engine/seeder/metadata-seeds/survey-results-metadata-seeds';
import { SeederService } from 'src/engine/seeder/seeder.service';
import { WorkspaceDataSourceService } from 'src/engine/workspace-datasource/workspace-datasource.service';
import { seedWorkspaceWithDemoData } from 'src/engine/workspace-manager/demo-objects-prefill-data/seed-workspace-with-demo-data';
import { standardObjectsPrefillData } from 'src/engine/workspace-manager/standard-objects-prefill-data/standard-objects-prefill-data';
import { WorkspaceSyncMetadataService } from 'src/engine/workspace-manager/workspace-sync-metadata/workspace-sync-metadata.service';

@Injectable()
export class WorkspaceManagerService {
  constructor(
    private readonly workspaceDataSourceService: WorkspaceDataSourceService,
    private readonly workspaceMigrationService: WorkspaceMigrationService,
    private readonly objectMetadataService: ObjectMetadataService,
    private readonly seederService: SeederService,
    private readonly dataSourceService: DataSourceService,
    private readonly workspaceSyncMetadataService: WorkspaceSyncMetadataService,
    private readonly permissionsService: PermissionsService,
    @InjectRepository(FieldMetadataEntity, 'metadata')
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(RelationMetadataEntity, 'metadata')
    private readonly relationMetadataRepository: Repository<RelationMetadataEntity>,
    @InjectRepository(UserWorkspace, 'core')
    private readonly userWorkspaceRepository: Repository<UserWorkspace>,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService,
  ) {}

  /**
   * Init a workspace by creating a new data source and running all migrations
   * @param workspaceId
   * @returns Promise<void>
   */
  public async init(workspaceId: string): Promise<void> {
    const schemaName =
      await this.workspaceDataSourceService.createWorkspaceDBSchema(
        workspaceId,
      );

    const dataSourceMetadata =
      await this.dataSourceService.createDataSourceMetadata(
        workspaceId,
        schemaName,
      );

    await this.workspaceSyncMetadataService.synchronize({
      workspaceId,
      dataSourceId: dataSourceMetadata.id,
    });

    const permissionsEnabled =
      await this.permissionsService.isPermissionsEnabled();

    if (permissionsEnabled === true) {
      await this.initPermissions(workspaceId);
    }

    await this.prefillWorkspaceWithStandardObjects(
      dataSourceMetadata,
      workspaceId,
    );
  }

  /**
   * InitDemo a workspace by creating a new data source and running all migrations
   * @param workspaceId
   * @returns Promise<void>
   */
  public async initDemo(workspaceId: string): Promise<void> {
    const schemaName =
      await this.workspaceDataSourceService.createWorkspaceDBSchema(
        workspaceId,
      );

    const dataSourceMetadata =
      await this.dataSourceService.createDataSourceMetadata(
        workspaceId,
        schemaName,
      );

    await this.workspaceSyncMetadataService.synchronize({
      workspaceId,
      dataSourceId: dataSourceMetadata.id,
    });

    await this.prefillWorkspaceWithDemoObjects(dataSourceMetadata, workspaceId);
  }

  public async initDev(workspaceId: string): Promise<void> {
    const schemaName =
      await this.workspaceDataSourceService.createWorkspaceDBSchema(
        workspaceId,
      );

    const dataSourceMetadata =
      await this.dataSourceService.createDataSourceMetadata(
        workspaceId,
        schemaName,
      );

    await this.workspaceSyncMetadataService.synchronize({
      workspaceId: workspaceId,
      dataSourceId: dataSourceMetadata.id,
    });

    const permissionsEnabled =
      await this.permissionsService.isPermissionsEnabled();

    if (permissionsEnabled === true) {
      await this.initPermissions(workspaceId);
    }
  }

  /**
   *
   * We are prefilling a few standard objects with data to make it easier for the user to get started.
   *
   * @param dataSourceMetadata
   * @param workspaceId
   */
  private async prefillWorkspaceWithStandardObjects(
    dataSourceMetadata: DataSourceEntity,
    workspaceId: string,
  ) {
    const workspaceDataSource =
      await this.workspaceDataSourceService.connectToWorkspaceDataSource(
        workspaceId,
      );

    if (!workspaceDataSource) {
      throw new Error('Could not connect to workspace data source');
    }

    const createdObjectMetadata =
      await this.objectMetadataService.findManyWithinWorkspace(workspaceId);

    await standardObjectsPrefillData(
      workspaceDataSource,
      dataSourceMetadata.schema,
      createdObjectMetadata,
    );
  }

  /**
   *
   * We are prefilling a few demo objects with data to make it easier for the user to get started.
   *
   * @param dataSourceMetadata
   * @param workspaceId
   */
  private async prefillWorkspaceWithDemoObjects(
    dataSourceMetadata: DataSourceEntity,
    workspaceId: string,
  ) {
    const workspaceDataSource =
      await this.workspaceDataSourceService.connectToWorkspaceDataSource(
        workspaceId,
      );

    if (!workspaceDataSource) {
      throw new Error('Could not connect to workspace data source');
    }

    const createdObjectMetadata =
      await this.objectMetadataService.findManyWithinWorkspace(workspaceId);

    await seedWorkspaceWithDemoData(
      workspaceDataSource,
      dataSourceMetadata.schema,
      createdObjectMetadata,
    );

    await this.seederService.seedCustomObjects(
      dataSourceMetadata.id,
      workspaceId,
      PETS_METADATA_SEEDS,
      PETS_DATA_SEEDS,
    );

    await this.seederService.seedCustomObjects(
      dataSourceMetadata.id,
      workspaceId,
      SURVEY_RESULTS_METADATA_SEEDS,
      SURVEY_RESULTS_DATA_SEEDS,
    );
  }

  /**
   *
   * Delete a workspace by deleting all metadata and the schema
   *
   * @param workspaceId
   */
  public async delete(workspaceId: string): Promise<void> {
    // Delete data from metadata tables
    await this.relationMetadataRepository.delete({
      workspaceId,
    });
    await this.fieldMetadataRepository.delete({
      workspaceId,
    });

    await this.objectMetadataService.deleteObjectsMetadata(workspaceId);
    await this.workspaceMigrationService.deleteAllWithinWorkspace(workspaceId);
    await this.dataSourceService.delete(workspaceId);
    // Delete schema
    await this.workspaceDataSourceService.deleteWorkspaceDBSchema(workspaceId);
  }

  private async initPermissions(workspaceId: string) {
    const adminRole = await this.roleService.createAdminRole({
      workspaceId,
    });

    const userWorkspaces = await this.userWorkspaceRepository.find({
      where: {
        workspaceId,
      },
    });

    if (isEmpty(userWorkspaces)) {
      throw new PermissionsException(
        'User workspace not found',
        PermissionsExceptionCode.USER_WORKSPACE_NOT_FOUND,
      );
    }

    for (const userWorkspace of userWorkspaces) {
      await this.userRoleService.assignRoleToUserWorkspace({
        workspaceId,
        userWorkspaceId: userWorkspace.id,
        roleId: adminRole.id,
      });
    }
  }
}
