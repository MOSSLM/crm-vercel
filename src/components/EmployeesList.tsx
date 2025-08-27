"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AddEmployeeModal } from './AddEmployeeModal';
import { EditEmployeeModal } from './EditEmployeeModal';
import { contactsApi } from '../utils/contactApi';
import { toast } from "sonner";
import { 
  Users, 
  Plus, 
  Mail, 
  Phone, 
  User, 
  Briefcase,
  Loader2,
  Edit3 
} from 'lucide-react';

interface Employee {
  id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  tel?: string;
  poste?: string;
  entreprise_id: number;
}

interface EmployeesListProps {
  companyId: number;
  companyName: string;
  className?: string;
}

export const EmployeesList: React.FC<EmployeesListProps> = ({ 
  companyId, 
  companyName, 
  className 
}) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await contactsApi.getByCompany(companyId);
      setEmployees(data);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast.error("Erreur lors du chargement des employés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [companyId]);

  const handleEmployeeAdded = () => {
    loadEmployees();
  };

  const handleEmployeeUpdated = () => {
    loadEmployees();
    setSelectedEmployee(null);
  };

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowEditModal(true);
  };

  const getEmployeeDisplayName = (employee: Employee) => {
    const nom = employee.nom || '';
    const prenom = employee.prenom || '';
    
    if (nom && prenom) {
      return `${prenom} ${nom}`;
    } else if (nom) {
      return nom;
    } else if (prenom) {
      return prenom;
    }
    return 'Employé';
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Employés ({employees.length})
            </CardTitle>
            <Button 
              size="sm" 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
          <CardDescription>
            Liste des employés de {companyName}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {employees.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Aucun employé</h3>
              <p className="text-muted-foreground mb-4">
                Aucun employé n'a été ajouté à cette entreprise.
              </p>
              <Button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter un employé
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {employees.map((employee) => (
                <div 
                  key={employee.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => handleEmployeeClick(employee)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {getEmployeeDisplayName(employee)}
                        </span>
                        {employee.poste && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            <Briefcase className="h-3 w-3 mr-1" />
                            {employee.poste}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {employee.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-48">{employee.email}</span>
                          </div>
                        )}
                        {employee.tel && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            <span>{employee.tel}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    
                    <div className="flex gap-2">
                      {employee.email && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={`mailto:${employee.email}`}>
                            <Mail className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {employee.tel && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={`tel:${employee.tel}`}>
                            <Phone className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <AddEmployeeModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        companyId={companyId}
        companyName={companyName}
        onEmployeeAdded={handleEmployeeAdded}
      />

      <EditEmployeeModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        employee={selectedEmployee}
        companyName={companyName}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </>
  );
};