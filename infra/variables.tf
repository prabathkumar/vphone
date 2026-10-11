# Cloud provider — swap "oci" for "aws" or "gcp" when ready
variable "cloud_provider" {
  description = "Target cloud provider: oci | aws | gcp"
  default     = "oci"
}

# OCI-specific (leave blank if using AWS/GCP)
variable "tenancy_ocid"        { default = "" }
variable "user_ocid"           { default = "" }
variable "fingerprint"         { default = "" }
variable "private_key_path"    { default = "~/.oci/oci_api_key.pem" }
variable "region"              { default = "ap-mumbai-1" }
variable "compartment_id"      { default = "" }
variable "availability_domain" { default = "" }
variable "ssh_public_key_path" { default = "~/.ssh/id_rsa.pub" }

# Ubuntu 22.04 ARM image OCID for ap-mumbai-1 (Oracle Always Free)
variable "ubuntu_image_ocid" {
  default = "ocid1.image.oc1.ap-mumbai-1.aaaaaaaav4u3t6yp3jmjkl3lftw7jqvzxgtjxhkvhfjadbw6v3jqfivxqga"
}
